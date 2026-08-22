//! Small shims replicating the exact JS/lodash semantics the tag logic
//! depended on, so rendered output stays byte-identical.

use std::cmp::Ordering;

use serde_json::Value;

/// `_.get(obj, "a.b.c")` — dot-separated path lookup, numeric segments index
/// into arrays.
pub fn get_path<'v>(mut val: &'v Value, path: &str) -> Option<&'v Value> {
    for seg in path.split('.') {
        val = match val {
            Value::Object(map) => map.get(seg)?,
            Value::Array(arr) => arr.get(seg.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(val)
}

/// `_.escape` — HTML-escapes exactly & < > " '.
pub fn lodash_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

/// JS string coercion for object keys (`counts[x]`).
pub fn js_string(val: &Value) -> String {
    match val {
        Value::String(s) => s.clone(),
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        other => other.to_string(),
    }
}

/// Approximation of `String.prototype.localeCompare` under the default (en)
/// collation for the strings that realistically appear in filter values:
/// case-insensitive primary comparison, lowercase-first tiebreak.
pub fn locale_compare(a: &str, b: &str) -> Ordering {
    let key = |s: &str| -> (String, String) { (s.to_lowercase(), s.to_string()) };
    let (al, ao) = key(a);
    let (bl, bo) = key(b);
    al.cmp(&bl).then_with(|| ao.cmp(&bo).reverse()).then(Ordering::Equal)
}

/// `str.toLowerCase().replace(' ', '-')` — JS replace with a string pattern
/// replaces only the first occurrence.
pub fn fspec_id(name: &str) -> String {
    name.to_lowercase().replacen(' ', "-", 1)
}

/// `str.replace(/^\//, '').replace(/\/$/, '')` — strip one leading and one
/// trailing slash.
pub fn trim_pub_dir(s: &str) -> String {
    let s = s.strip_prefix('/').unwrap_or(s);
    let s = s.strip_suffix('/').unwrap_or(s);
    s.to_string()
}

/// JS-style `String.replace(regex, replacement)` (non-global): substitute the
/// first match, expanding `$1`..`$99`, `$<name>`, `$&` and `$$`.
pub fn js_regex_replace(re: &regress::Regex, input: &str, replacement: &str) -> String {
    let Some(m) = re.find(input) else {
        return input.to_string();
    };
    let mut out = String::new();
    out.push_str(&input[..m.range().start]);

    let group_str = |i: usize| -> &str {
        m.captures
            .get(i.wrapping_sub(1))
            .and_then(|g| g.as_ref())
            .map(|r| &input[r.clone()])
            .unwrap_or("")
    };

    let chars: Vec<char> = replacement.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] != '$' || i + 1 >= chars.len() {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        match chars[i + 1] {
            '$' => {
                out.push('$');
                i += 2;
            }
            '&' => {
                out.push_str(&input[m.range()]);
                i += 2;
            }
            '<' => {
                if let Some(end) = chars[i + 2..].iter().position(|&c| c == '>') {
                    let name: String = chars[i + 2..i + 2 + end].iter().collect();
                    if let Some(r) = m.named_group(&name) {
                        out.push_str(&input[r]);
                    }
                    i += end + 3;
                } else {
                    out.push('$');
                    i += 1;
                }
            }
            c if c.is_ascii_digit() => {
                let mut num = c.to_digit(10).unwrap() as usize;
                let mut used = 2;
                if i + 2 < chars.len() && chars[i + 2].is_ascii_digit() {
                    let two = num * 10 + chars[i + 2].to_digit(10).unwrap() as usize;
                    if two <= m.captures.len() {
                        num = two;
                        used = 3;
                    }
                }
                if num >= 1 && num <= m.captures.len() {
                    out.push_str(group_str(num));
                    i += used;
                } else {
                    out.push('$');
                    i += 1;
                }
            }
            _ => {
                out.push('$');
                i += 1;
            }
        }
    }

    out.push_str(&input[m.range().end..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn regex_replace_groups() {
        let re = regress::Regex::new("^abc'(.*)$").unwrap();
        assert_eq!(js_regex_replace(&re, "abc'1", "The $1 ABC"), "The 1 ABC");
        assert_eq!(js_regex_replace(&re, "abc'1", "https://abc.com/$1"), "https://abc.com/1");
        assert_eq!(js_regex_replace(&re, "nomatch", "The $1 ABC"), "nomatch");
        assert_eq!(js_regex_replace(&re, "abc'x", "$$ $& q"), "$ abc'x q");
    }

    #[test]
    fn escapes() {
        assert_eq!(lodash_escape(r#"{"a":["b'c<>&"]}"#), "{&quot;a&quot;:[&quot;b&#39;c&lt;&gt;&amp;&quot;]}");
    }

    #[test]
    fn ids_and_dirs() {
        assert_eq!(fspec_id("My Long Name"), "my-long Name".to_lowercase());
        assert_eq!(trim_pub_dir("/assets/pub/"), "assets/pub");
        assert_eq!(trim_pub_dir("assets/"), "assets");
    }
}
