import os
import re

styles_path = r'd:\Summarizer\frontend\src\styles'

for fname in os.listdir(styles_path):
    if not fname.endswith('.css'):
        continue
    
    fpath = os.path.join(styles_path, fname)
    
    with open(fpath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    new_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Check if this is an orphaned closing brace (a line with just })
        if line.strip() == '}':
            # Look back to see if there's an unmatched opening
            # Count braces in everything we've added so far
            open_count = 0
            for added_line in new_lines:
                open_count += added_line.count('{') - added_line.count('}')
            
            # If we're already balanced or negative, skip this closing brace
            if open_count <= 0:
                i += 1
                continue
        
        new_lines.append(line)
        i += 1
    
    with open(fpath, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    
    print(f'✓ Fixed: {fname}')

print('Done!')
