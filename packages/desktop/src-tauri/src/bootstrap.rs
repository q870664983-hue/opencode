use serde_json::{Map, Value, json};
use std::{env, fs, path::PathBuf};

const APP_DIR_NAME: &str = "opencode";
const DEFAULT_BASE_URL: &str = "https://ai.fmusic.cc";
const DEFAULT_MODEL: &str = "gpt-5.4";
const DEFAULT_SMALL_MODEL: &str = "gpt-5-mini";

struct CodexPreset {
    base_url: String,
    model: String,
    api_key: Option<String>,
}

pub fn seed_bundled_configuration() -> Result<(), String> {
    let preset = read_codex_preset();
    seed_global_config(preset.as_ref())?;
    seed_auth(preset.as_ref())?;
    Ok(())
}

fn seed_global_config(preset: Option<&CodexPreset>) -> Result<(), String> {
    let dir = opencode_config_dir()?;
    fs::create_dir_all(&dir).map_err(|err| format!("Failed to create config dir: {err}"))?;

    let has_existing = ["opencode.jsonc", "opencode.json", "config.json"]
        .iter()
        .map(|file| dir.join(file))
        .any(|path| path.exists());

    if has_existing {
        return Ok(());
    }

    let base_url = preset
        .map(|item| item.base_url.as_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_BASE_URL);
    let model = preset
        .map(|item| item.model.as_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_MODEL);

    let contents = format!(
        r#"{{
  "$schema": "https://opencode.ai/config.json",
  // Seeded by SineCode on first launch.
  "model": "sub2api/{model}",
  "small_model": "sub2api/{small_model}",
  "provider": {{
    "sub2api": {{
      "name": "Sub2API",
      "env": ["OPENAI_API_KEY"],
      "npm": "@ai-sdk/openai-compatible",
      "options": {{
        "baseURL": "{base_url}"
      }},
      "models": {{
        "{model}": {{
          "name": "{model_label}",
          "reasoning": true,
          "attachment": true,
          "tool_call": true,
          "limit": {{
            "context": 256000,
            "output": 32768
          }},
          "modalities": {{
            "input": ["text", "image"],
            "output": ["text"]
          }}
        }},
        "{small_model}": {{
          "name": "{small_model_label}",
          "reasoning": true,
          "attachment": true,
          "tool_call": true,
          "limit": {{
            "context": 128000,
            "output": 16384
          }},
          "modalities": {{
            "input": ["text", "image"],
            "output": ["text"]
          }}
        }}
      }}
    }},
    "fmusic": {{
      "name": "FMusic",
      "env": ["OPENAI_API_KEY"],
      "npm": "@ai-sdk/openai-compatible",
      "options": {{
        "baseURL": "{base_url}"
      }},
      "models": {{
        "{model}": {{
          "name": "{model_label}",
          "reasoning": true,
          "attachment": true,
          "tool_call": true,
          "limit": {{
            "context": 256000,
            "output": 32768
          }},
          "modalities": {{
            "input": ["text", "image"],
            "output": ["text"]
          }}
        }},
        "{small_model}": {{
          "name": "{small_model_label}",
          "reasoning": true,
          "attachment": true,
          "tool_call": true,
          "limit": {{
            "context": 128000,
            "output": 16384
          }},
          "modalities": {{
            "input": ["text", "image"],
            "output": ["text"]
          }}
        }}
      }}
    }}
  }}
}}
"#,
        model = model,
        small_model = DEFAULT_SMALL_MODEL,
        base_url = escape_json_string(base_url),
        model_label = escape_json_string(&display_model_name(model)),
        small_model_label = escape_json_string(&display_model_name(DEFAULT_SMALL_MODEL)),
    );

    let path = dir.join("opencode.jsonc");
    fs::write(&path, contents).map_err(|err| format!("Failed to write bundled config: {err}"))?;
    Ok(())
}

fn seed_auth(preset: Option<&CodexPreset>) -> Result<(), String> {
    let Some(api_key) = preset.and_then(|item| item.api_key.as_ref()) else {
        return Ok(());
    };

    let dir = opencode_data_dir()?;
    fs::create_dir_all(&dir).map_err(|err| format!("Failed to create data dir: {err}"))?;

    let path = dir.join("auth.json");
    let existing = fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .unwrap_or_else(|| Value::Object(Map::new()));

    let mut object = match existing {
        Value::Object(map) => map,
        _ => Map::new(),
    };

    let payload = |key: &str| json!({ "type": "api", "key": key });

    object
        .entry("sub2api".to_string())
        .or_insert_with(|| payload(api_key));
    object
        .entry("fmusic".to_string())
        .or_insert_with(|| payload(api_key));

    let serialized = serde_json::to_string_pretty(&Value::Object(object))
        .map_err(|err| format!("Failed to serialize auth seed: {err}"))?;
    fs::write(&path, format!("{serialized}\n"))
        .map_err(|err| format!("Failed to write auth seed: {err}"))?;
    Ok(())
}

fn read_codex_preset() -> Option<CodexPreset> {
    let home = codex_home()?;
    let config_path = home.join("config.toml");
    let auth_path = home.join("auth.json");

    let config_text = fs::read_to_string(config_path).ok()?;
    let auth_json = fs::read_to_string(auth_path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok());

    let api_key = auth_json
        .as_ref()
        .and_then(|value| value.get("OPENAI_API_KEY"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .filter(|value| !value.trim().is_empty());

    let mut current_section = String::new();
    let mut base_url = None;
    let mut model = None;

    for raw in config_text.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }

        if line.starts_with('[') && line.ends_with(']') {
            current_section = line.trim_matches(&['[', ']'][..]).to_string();
            continue;
        }

        if current_section.is_empty() {
            if model.is_none() {
                model = parse_toml_string(line, "model");
            }
            continue;
        }

        if current_section == "model_providers.sub2api"
            || current_section == "model_providers.fmusic"
        {
            if base_url.is_none() {
                base_url = parse_toml_string(line, "base_url");
            }
        }
    }

    Some(CodexPreset {
        base_url: base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
        model: model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
        api_key,
    })
}

fn parse_toml_string(line: &str, key: &str) -> Option<String> {
    let (left, right) = line.split_once('=')?;
    if left.trim() != key {
        return None;
    }

    let value = right.trim();
    if !(value.starts_with('"') && value.ends_with('"')) {
        return None;
    }

    Some(value.trim_matches('"').to_string())
}

fn display_model_name(model: &str) -> String {
    model
        .split('-')
        .map(|part| {
            let lower = part.to_ascii_lowercase();
            if lower == "gpt" {
                "GPT".to_string()
            } else {
                let mut chars = lower.chars();
                match chars.next() {
                    Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
                    None => String::new(),
                }
            }
        })
        .collect::<Vec<_>>()
        .join("-")
}

fn escape_json_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn codex_home() -> Option<PathBuf> {
    if let Ok(value) = env::var("CODEX_HOME") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }

    dirs::home_dir().map(|path| path.join(".codex"))
}

fn opencode_config_dir() -> Result<PathBuf, String> {
    if let Ok(value) = env::var("OPENCODE_CONFIG_DIR") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }

    dirs::config_dir()
        .map(|path| path.join(APP_DIR_NAME))
        .ok_or_else(|| "Could not resolve opencode config directory".to_string())
}

fn opencode_data_dir() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|path| path.join(APP_DIR_NAME))
        .ok_or_else(|| "Could not resolve opencode data directory".to_string())
}
