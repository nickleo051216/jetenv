
import os

logo_file = r"C:\Users\jeten\.gemini\antigravity\scratch\quotation-system\logo_base64.txt"
app_file = r"C:\Users\jeten\.gemini\antigravity\scratch\quotation-system\src\App.jsx"

with open(logo_file, 'r', encoding='utf-8') as f:
    base64_content = f.read().strip()

# Construct the new content line
new_line = f"const LOGO_BASE64 = `data:image/jpeg;base64,{base64_content}`;\nconst DEFAULT_LOGO_PATH = LOGO_BASE64;"

with open(app_file, 'r', encoding='utf-8') as f:
    app_content = f.read()

# Replace the target line
target_line = "const DEFAULT_LOGO_PATH = '/logo.jpg';"
if target_line in app_content:
    new_app_content = app_content.replace(target_line, new_line)
    
    with open(app_file, 'w', encoding='utf-8') as f:
        f.write(new_app_content)
    print("Successfully patched App.jsx with LOGO_BASE64")
else:
    print("Target line not found in App.jsx")
