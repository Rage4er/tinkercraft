#!/bin/bash
set -e

echo "🚀 Deploy to GitHub Pages"
echo "========================="

# 1. Build the app
cd web-app
echo "1️⃣  Installing dependencies..."
if command -v pnpm &> /dev/null; then
  pnpm install
elif command -v yarn &> /dev/null; then
  yarn install
else
  npm install
fi

echo "2️⃣  Building project..."
if command -v pnpm &> /dev/null; then
  pnpm build
elif command -v yarn &> /dev/null; then
  yarn build
else
  npm run build
fi

# 2. Switch to gh-pages branch
echo "3️⃣  Switching to gh-pages branch..."
cd ..
git checkout --orphan gh-pages
git rm -rf .

# 4. Copy landing page to root
echo "4️⃣  Copying landing page..."
cp index.html .

# 5. Copy built app to app/ folder
echo "5️⃣  Copying built app to app/..."
mkdir -p app
cp -r web-app/dist/* app/

# 6. Commit and push
echo "6️⃣  Committing..."
git add .
git commit -m "Deploy to GitHub Pages [skip ci]"

echo "7️⃣  Pushing gh-pages..."
git push origin gh-pages --force

# 8. Switch back to main
echo "8️⃣  Switching back to main..."
git checkout main

echo ""
echo "✅ Done!"
echo "🌐 Landing page: https://rage4er.github.io/tinkercraft/"
echo "🌐 Editor:       https://rage4er.github.io/tinkercraft/app/"
echo "⚙️  GitHub Pages: gh-pages branch, Folder: / (root)"
