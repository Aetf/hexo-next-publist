//! Instance-options parsing: yaml between the publist tags → resolved options.
//! Replaces js-yaml + Ajv (v2 configs are validated by the typed model below;
//! unknown or mistyped fields fail the build like Ajv's
//! additionalProperties: false used to).

use chrono::NaiveDateTime;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::date::parse_iso_loose;
use super::jsval::{fspec_id, trim_pub_dir};
use super::{Diag, Fatal};

#[derive(Serialize, Clone)]
pub struct Fspec {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Clone)]
pub struct Conf {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    pub venue: String,
    pub cat: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matches: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub acceptance: Option<String>,
    #[serde(skip)]
    pub date: Option<NaiveDateTime>,
    /// v1 configs carried arbitrary extra keys through to the conf object.
    #[serde(flatten)]
    pub extra: IndexMap<String, Value>,
}

#[derive(Serialize, Clone)]
pub struct Fuzzy {
    pub pattern: String,
    /// Key into `confs`.
    pub key: String,
}

#[derive(Serialize)]
pub struct InstOpts {
    pub version: i64,
    pub pub_dir: String,
    pub show_unpublished: bool,
    pub highlight_authors: Vec<String>,
    pub extra_filters: Vec<Fspec>,
    pub confs: IndexMap<String, Conf>,
    /// Confs that use regex matching, in definition order.
    pub confs_fuzzy: Vec<Fuzzy>,
    /// v1 passthrough of unrecognized top-level keys.
    #[serde(flatten)]
    pub extra: IndexMap<String, Value>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawV2 {
    #[allow(dead_code)]
    version: i64,
    #[serde(default = "default_pub_dir")]
    pub_dir: String,
    #[serde(default)]
    show_unpublished: bool,
    #[serde(default)]
    highlight_authors: Vec<String>,
    #[serde(default)]
    extra_filters: Vec<RawFspec>,
    #[serde(default)]
    venues: IndexMap<String, RawVenue>,
}

fn default_pub_dir() -> String {
    "assets".to_string()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawFspec {
    name: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawVenue {
    #[serde(default)]
    category: String,
    url: Option<String>,
    occurrences: Vec<RawOccurrence>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawOccurrence {
    key: String,
    name: String,
    matches: Option<String>,
    date: Option<String>,
    url: Option<String>,
    acceptance: Option<String>,
}

pub fn load(yaml: &str, diags: &mut Vec<Diag>) -> Result<InstOpts, Fatal> {
    let value: Value = match serde_norway::from_str::<serde_norway::Value>(yaml) {
        Ok(v) => serde_json::to_value(v).map_err(|e| Fatal::tag(e.to_string()))?,
        Err(e) => return Err(Fatal::tag(format!("invalid yaml: {e}"))),
    };
    let value = match value {
        Value::Object(_) => value,
        Value::Null => Value::Object(Default::default()),
        _ => return Err(Fatal::tag("instOpts must be a mapping".to_string())),
    };

    let version = value.get("version").and_then(Value::as_i64).unwrap_or(1);
    if version < 2 {
        diags.push(Diag::warn(
            "you are using an old version of the instOpts. Please migrate to version 2 ASAP.",
        ));
        return load_v1(value);
    }
    if version < 3 {
        return load_v2(value);
    }
    Err(Fatal::tag(format!("Config version newer than supported: {version}")))
}

fn load_v2(value: Value) -> Result<InstOpts, Fatal> {
    let raw: RawV2 = serde_json::from_value(value)
        .map_err(|e| Fatal::tag(format!("invalid instOpts: {e}")))?;

    let mut confs = IndexMap::new();
    for (venue_id, venue) in &raw.venues {
        for occ in &venue.occurrences {
            let conf = Conf {
                key: Some(occ.key.clone()),
                venue: venue_id.clone(),
                cat: venue.category.clone(),
                name: occ.name.clone(),
                matches: occ.matches.clone(),
                url: occ.url.clone().or_else(|| venue.url.clone()),
                acceptance: occ.acceptance.clone(),
                date: occ.date.as_deref().and_then(parse_iso_loose),
                extra: IndexMap::new(),
            };
            confs.insert(occ.key.clone(), conf);
        }
    }
    // built from the final map so a duplicated key keeps the old _.fromPairs
    // last-wins semantics
    let confs_fuzzy = confs
        .iter()
        .filter_map(|(key, c)| {
            c.matches.as_ref().map(|pattern| Fuzzy { pattern: pattern.clone(), key: key.clone() })
        })
        .collect();

    Ok(InstOpts {
        version: 2,
        pub_dir: trim_pub_dir(&raw.pub_dir),
        show_unpublished: raw.show_unpublished,
        highlight_authors: raw.highlight_authors,
        extra_filters: raw
            .extra_filters
            .into_iter()
            .map(|f| Fspec { id: fspec_id(&f.name), name: f.name, path: f.path })
            .collect(),
        confs,
        confs_fuzzy,
        extra: IndexMap::new(),
    })
}

/// v1 configs had no validation; venues is cat → confkey → conf fields, and
/// unknown keys pass through.
fn load_v1(value: Value) -> Result<InstOpts, Fatal> {
    let Value::Object(map) = value else { unreachable!() };

    let mut opts = InstOpts {
        version: 1,
        pub_dir: "assets".to_string(),
        show_unpublished: false,
        highlight_authors: vec![],
        extra_filters: vec![],
        confs: IndexMap::new(),
        confs_fuzzy: vec![],
        extra: IndexMap::new(),
    };

    let as_str = |v: &Value| v.as_str().map(str::to_string);
    for (key, val) in map {
        match key.as_str() {
            "version" => {}
            "pub_dir" => {
                if let Some(s) = val.as_str() {
                    opts.pub_dir = trim_pub_dir(s);
                }
            }
            "show_unpublished" => opts.show_unpublished = val.as_bool().unwrap_or(false),
            "highlight_authors" => {
                if let Value::Array(arr) = val {
                    opts.highlight_authors = arr.iter().filter_map(as_str).collect();
                }
            }
            "extra_filters" => {
                if let Value::Array(arr) = val {
                    opts.extra_filters = arr
                        .iter()
                        .filter_map(|f| {
                            let name = f.get("name").and_then(Value::as_str)?;
                            let path = f.get("path").and_then(Value::as_str)?;
                            Some(Fspec {
                                id: fspec_id(name),
                                name: name.to_string(),
                                path: path.to_string(),
                            })
                        })
                        .collect();
                }
            }
            "venues" => {
                let Value::Object(cats) = val else { continue };
                for (cat, confs_val) in cats {
                    let Value::Object(confs) = confs_val else { continue };
                    for (conf_key, conf_val) in confs {
                        let get = |k: &str| conf_val.get(k).and_then(Value::as_str);
                        let known = ["venue", "name", "date", "url", "acceptance", "cat"];
                        let extra = match &conf_val {
                            Value::Object(m) => m
                                .iter()
                                .filter(|(k, _)| !known.contains(&k.as_str()))
                                .map(|(k, v)| (k.clone(), v.clone()))
                                .collect(),
                            _ => IndexMap::new(),
                        };
                        let conf = Conf {
                            key: None,
                            venue: get("venue").unwrap_or_default().to_string(),
                            cat: cat.clone(),
                            name: get("name").unwrap_or_default().to_string(),
                            matches: None,
                            url: Some(get("url").unwrap_or_default().to_string()),
                            acceptance: Some(get("acceptance").unwrap_or_default().to_string()),
                            date: get("date").and_then(parse_iso_loose),
                            extra,
                        };
                        opts.confs.insert(conf_key.clone(), conf);
                    }
                }
            }
            _ => {
                opts.extra.insert(key.clone(), val.clone());
            }
        }
    }

    Ok(opts)
}
