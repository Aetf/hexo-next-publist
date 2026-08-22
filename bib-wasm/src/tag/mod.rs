//! The publist tag data pipeline: everything between "yaml + bib items in"
//! and "template context out". The JS side only parses the tag, calls this,
//! logs diagnostics, and feeds the result to the nunjucks template.

mod date;
mod instopts;
mod jsval;

use chrono::NaiveDateTime;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use date::{parse_bib_date, parse_year_month, subtract_months};
use instopts::{Conf, InstOpts};
use jsval::{get_path, js_regex_replace, js_string, locale_compare, lodash_escape};

#[derive(Serialize)]
pub struct Diag {
    pub level: String,
    pub message: String,
}

impl Diag {
    pub fn warn(message: impl Into<String>) -> Self {
        Self { level: "warn".into(), message: message.into() }
    }
    pub fn info(message: impl Into<String>) -> Self {
        Self { level: "info".into(), message: message.into() }
    }
}

#[derive(Serialize)]
pub struct Fatal {
    /// "tag" → PublistTagError, "strict" → PublistStrictAbort on the JS side.
    pub kind: String,
    pub message: String,
}

impl Fatal {
    pub fn tag(message: impl Into<String>) -> Self {
        Self { kind: "tag".into(), message: message.into() }
    }
    pub fn strict(message: impl Into<String>) -> Self {
        Self { kind: "strict".into(), message: message.into() }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
    pub yaml: String,
    pub items: Vec<Map<String, Value>>,
    #[serde(default)]
    pub strict: bool,
    /// opts.new_month as read by the template (may be absent).
    #[serde(default)]
    pub new_month: Option<i64>,
    pub now_ms: i64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub inst_opts: Option<InstOpts>,
    pub pubs: Vec<Map<String, Value>>,
    pub fspecs: Vec<Value>,
    pub logs: Vec<Diag>,
    pub fatal: Option<Fatal>,
}

pub fn process(input: Input) -> Output {
    let mut out = Output::default();
    match run(input, &mut out) {
        Ok(()) => {}
        Err(fatal) => out.fatal = Some(fatal),
    }
    out
}

struct ResolvedPub {
    item: Map<String, Value>,
    conf: Option<Conf>,
    confkey: String,
    date: NaiveDateTime,
}

fn run(input: Input, out: &mut Output) -> Result<(), Fatal> {
    let now = chrono::DateTime::from_timestamp_millis(input.now_ms)
        .ok_or_else(|| Fatal::tag("invalid nowMs"))?
        .naive_utc();

    let opts = instopts::load(&input.yaml, &mut out.logs)?;

    let fuzzy: Vec<(regress::Regex, &str)> = opts
        .confs_fuzzy
        .iter()
        .filter_map(|f| regress::Regex::new(&f.pattern).ok().map(|re| (re, f.key.as_str())))
        .collect();

    // resolve conf, date and links for each item
    let mut pubs: Vec<ResolvedPub> = vec![];
    for item in input.items {
        let citekey = str_field(&item, "citekey");
        let confkey = str_field(&item, "confkey");

        // conf: literal key lookup, then first regex match
        let mut conf = opts.confs.get(&confkey).cloned();
        if conf.is_none() {
            if let Some((re, key)) = fuzzy.iter().find(|(re, _)| re.find(&confkey).is_some()) {
                let mut c = opts.confs[*key].clone();
                c.url = c.url.as_deref().map(|u| js_regex_replace(re, &confkey, u));
                c.name = js_regex_replace(re, &confkey, &c.name);
                conf = Some(c);
            } else {
                let msg =
                    format!("bib entry '{citekey}' has unknown confkey '{confkey}'");
                if input.strict {
                    return Err(Fatal::strict(msg));
                }
                out.logs.push(Diag::warn(msg));
            }
        }

        // date: bib date field > conference date > bib year/month
        let mut resolved_date = None;
        if let Some(bib_date) = bib_field(&item, "date") {
            let start = bib_date.split('/').next().unwrap_or("");
            resolved_date = parse_bib_date(start);
            if resolved_date.is_none() {
                let msg =
                    format!("bib entry '{citekey}' has an invalid date field '{bib_date}'.");
                if input.strict {
                    return Err(Fatal::strict(msg));
                }
                out.logs.push(Diag::warn(msg));
            }
        }
        if resolved_date.is_none() {
            resolved_date = conf.as_ref().and_then(|c| c.date);
        }
        let date = match resolved_date {
            Some(d) => d,
            None => {
                let year = match bib_field(&item, "year") {
                    Some(y) => y,
                    None => {
                        let msg = format!(
                            "can not infer date for bib entry '{citekey}'. There is no date info for '{confkey}', and '{citekey}' doesn't have a valid year field."
                        );
                        if input.strict {
                            return Err(Fatal::strict(msg));
                        }
                        out.logs.push(Diag::warn(msg));
                        now.format("%Y").to_string()
                    }
                };
                let month = bib_field(&item, "month").unwrap_or_else(|| "1".to_string());
                match parse_year_month(&year, &month) {
                    Some(d) => d,
                    None => {
                        let msg = format!(
                            "can not infer date for bib entry '{citekey}'. There is no date info for '{confkey}', and '{citekey}' doesn't have a valid month field."
                        );
                        if input.strict {
                            return Err(Fatal::strict(msg));
                        }
                        out.logs.push(Diag::warn(msg));
                        now
                    }
                }
            }
        };

        pubs.push(ResolvedPub { item, conf, confkey, date });
    }

    // sort by date desc (stable), drop unpublished
    pubs.sort_by(|a, b| b.date.cmp(&a.date));
    pubs.retain(|p| {
        let published = p.date < now;
        if !published && !opts.show_unpublished {
            out.logs.push(Diag::info(format!(
                "skip publication in the future: {} @ {}",
                str_field(&p.item, "citekey"),
                p.date.format("%Y-%m-%d")
            )));
        }
        published || opts.show_unpublished
    });

    let new_cutoff = subtract_months(now, input.new_month.unwrap_or(0));

    // materialize pub objects for the template
    for p in &mut pubs {
        let citekey = str_field(&p.item, "citekey");

        // resolve link hrefs against pub_dir
        if let Some(Value::Array(links)) = p.item.get_mut("links") {
            for link in links {
                let Some(href) = link.get("href").and_then(Value::as_str) else { continue };
                let resolved = prepend_href(&opts.pub_dir, &citekey, href);
                link["href"] = Value::String(resolved);
            }
        }

        p.item.insert(
            "conf".to_string(),
            p.conf.as_ref().map_or(Value::Null, |c| serde_json::to_value(c).unwrap()),
        );
        p.item.insert(
            "date".to_string(),
            Value::String(p.date.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()),
        );
        p.item.insert("year".to_string(), Value::String(p.date.format("%Y").to_string()));
        p.item.insert("is_new".to_string(), Value::Bool(p.date > new_cutoff));

        // extra: values for each extra filter, and its escaped JSON form
        let mut extra = Map::new();
        for fspec in &opts.extra_filters {
            let value = get_path(&Value::Object(p.item.clone()), &fspec.path)
                .cloned()
                .unwrap_or(Value::Array(vec![]));
            let value = match value {
                Value::Array(_) => value,
                other => Value::Array(vec![other]),
            };
            extra.insert(fspec.id.clone(), value);
        }
        let escaped = lodash_escape(&serde_json::to_string(&extra).unwrap());
        p.item.insert("extra".to_string(), Value::Object(extra));
        p.item.insert("extra_json_escaped".to_string(), Value::String(escaped));
    }

    out.fspecs = build_fspecs(&opts, &pubs);
    out.pubs = pubs.into_iter().map(|p| p.item).collect();
    out.inst_opts = Some(opts);
    Ok(())
}

/// `_.get(item, 'bib.fields.<name>[0]')`
fn bib_field(item: &Map<String, Value>, name: &str) -> Option<String> {
    item.get("bib")?
        .get("fields")?
        .get(name)?
        .get(0)
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn str_field(item: &Map<String, Value>, name: &str) -> String {
    item.get(name).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn prepend_href(pub_dir: &str, citekey: &str, href: &str) -> String {
    let has_scheme = href
        .split_once(':')
        .map(|(scheme, _)| {
            let b = scheme.as_bytes();
            !b.is_empty()
                && b[0].is_ascii_lowercase()
                && b[1..]
                    .iter()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, b'+' | b'.' | b'-'))
        })
        .unwrap_or(false);
    if has_scheme || href.starts_with('/') {
        href.to_string()
    } else if pub_dir.is_empty() {
        format!("/{citekey}/{href}")
    } else {
        format!("/{pub_dir}/{citekey}/{href}")
    }
}

fn build_fspecs(opts: &InstOpts, pubs: &[ResolvedPub]) -> Vec<Value> {
    let all = json!({ "display": "All", "value": "!all", "count": pubs.len() });

    let mut fspecs: Vec<Value> = opts
        .extra_filters
        .iter()
        .map(|fspec| {
            // count each distinct value, in JS-object-key coerced string form
            let mut counts: IndexMap<String, usize> = IndexMap::new();
            for p in pubs {
                let values = p.item.get("extra").and_then(|e| e.get(&fspec.id));
                if let Some(Value::Array(arr)) = values {
                    for v in arr {
                        *counts.entry(js_string(v)).or_insert(0) += 1;
                    }
                }
            }
            let mut choices: Vec<Value> = counts
                .into_iter()
                .map(|(k, v)| json!({ "value": k, "count": v }))
                .collect();
            choices.sort_by(|x, y| {
                locale_compare(x["value"].as_str().unwrap(), y["value"].as_str().unwrap())
            });
            let cnt_others = pubs
                .iter()
                .filter(|p| {
                    p.item
                        .get("extra")
                        .and_then(|e| e.get(&fspec.id))
                        .and_then(Value::as_array)
                        .is_none_or(|a| a.is_empty())
                })
                .count();
            choices.insert(0, json!({ "display": "Others", "value": "!others", "count": cnt_others }));
            choices.insert(0, all.clone());
            json!({
                "name": fspec.name,
                "id": fspec.id,
                "path": fspec.path,
                "default": all,
                "choices": { "": choices },
            })
        })
        .collect();

    // the venue filter: venues grouped by category, in conf definition order
    let mut venues: IndexMap<String, Vec<Value>> = IndexMap::new();
    let mut by_cat: IndexMap<&str, Vec<&str>> = IndexMap::new();
    for conf in opts.confs.values() {
        let names = by_cat.entry(conf.cat.as_str()).or_default();
        if !names.contains(&conf.venue.as_str()) {
            names.push(conf.venue.as_str());
        }
    }
    for (cat, mut names) in by_cat {
        names.sort_unstable();
        let choices = names
            .into_iter()
            .map(|name| {
                let count = pubs
                    .iter()
                    .filter(|p| p.conf.as_ref().map(|c| c.venue.as_str()).unwrap_or("") == name)
                    .count();
                json!({ "value": name, "count": count })
            })
            .collect();
        venues.insert(cat.to_string(), choices);
    }
    let others = json!({
        "display": "Others",
        "value": "!others",
        "count": pubs.iter().filter(|p| p.confkey.is_empty()).count(),
    });
    let uncat = venues.entry(String::new()).or_default();
    uncat.splice(0..0, [all.clone(), others]);

    fspecs.insert(
        0,
        json!({
            "name": "Venue",
            "id": "venue",
            "default": all,
            "choices": venues,
        }),
    );

    fspecs
}
