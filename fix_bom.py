
import os

file_path = r'C:\Users\jeten\.gemini\antigravity\scratch\quotation-system\src\App.jsx'

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # The BOM character is \ufeff
    # We look for the specific pattern including the BOM
    target_pattern = "data:image/jpeg;base64,\ufeff"
    replacement = "data:image/jpeg;base64,"

    if target_pattern in content:
        new_content = content.replace(target_pattern, replacement)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Successfully removed BOM from LOGO_BASE64.")
    else:
        print("BOM pattern not found. It might have been already fixed or the pattern is different.")
        # Let's inspect around the area just in case
        idx = content.find("const LOGO_BASE64 = `data:image/jpeg;base64,")
        if idx != -1:
            snippet = content[idx:idx+60]
            print(f"Snippet found: {repr(snippet)}")
        else:
            print("LOGO_BASE64 definition not found.")

except Exception as e:
    print(f"Error: {e}")
