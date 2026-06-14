const fs = require('fs');
const path = require('path');

const rules = [
  { match: /@vegamo\/deepcode-cli/g, replace: 'anng-cli' },
  { match: /deepcode-cli/g, replace: 'anng-cli' },
  { match: /DeepCode/g, replace: 'ANNG CLI' },
  { match: /Deep Code/g, replace: 'ANNG CLI' },
  { match: /Deepcode/g, replace: 'ANNG CLI' },
  { match: /DEEPCODE\.md/g, replace: 'ANNG.md' },
  { match: /\.deepcode/g, replace: '.anng' },
  { match: /\bdeepcode\b/g, replace: 'anng' }, // word boundary to avoid breaking things, although deepcode is usually distinct
];

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === 'dist' || file === '.git') continue;
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else {
      if (
        fullPath.endsWith('.ts') ||
        fullPath.endsWith('.tsx') ||
        fullPath.endsWith('.md') ||
        fullPath.endsWith('.json') ||
        fullPath.endsWith('.js') ||
        fullPath.endsWith('.yaml') ||
        fullPath.endsWith('.yml')
      ) {
        let content = fs.readFileSync(fullPath, 'utf8');
        let modified = false;
        
        for (const rule of rules) {
          if (rule.match.test(content)) {
            content = content.replace(rule.match, rule.replace);
            modified = true;
          }
        }
        
        if (modified) {
          fs.writeFileSync(fullPath, content, 'utf8');
          console.log(`Updated ${fullPath}`);
        }
      }
    }
  }
}

walk('.');
