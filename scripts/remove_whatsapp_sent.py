import json
from pathlib import Path

EMBEDS_PATH = Path("message_formatting/discord/src/data/embeds.json")

def main():
    data = json.loads(EMBEDS_PATH.read_text(encoding="utf-8"))
    changed = False
    for entry in data:
        if "whatsappSent" in entry:
            del entry["whatsappSent"]
            changed = True
    if changed:
        EMBEDS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Removed whatsappSent flag from embeds.json")
    else:
        print("No whatsappSent flags found.")

if __name__ == "__main__":
    main()
