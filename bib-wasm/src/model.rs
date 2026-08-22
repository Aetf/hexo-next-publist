use serde::Serialize;

#[derive(Serialize, Default)]
pub struct Output {
    pub entries: Vec<Entry>,
    pub errors: Vec<PError>,
}

#[derive(Serialize)]
pub struct PError {
    pub line: usize,
    pub column: usize,
    pub message: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub key: String,
    #[serde(rename = "type")]
    pub kind: String,
    /// Field name → values, duplicate fields appended in source order.
    pub fields: Vec<Field>,
    pub creators: Creators,
    pub bib_str: String,
    /// Raw (verbatim) publist_abstract value, outer braces stripped.
    pub abstract_raw: Option<String>,
}

#[derive(Serialize)]
pub struct Field {
    pub name: String,
    pub values: Vec<String>,
}

#[derive(Serialize, Default)]
pub struct Creators {
    pub author: Vec<Creator>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Creator {
    pub first_name: String,
    pub last_name: String,
}
