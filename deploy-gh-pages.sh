#!/bin/bash
set -e

echo "🚀 Deploy to GitHub Pages (gh-pages branch)"
echo "============================================"

cd web-app

echo "1️⃣  Installing dependencies..."
npm install

echo "2️⃣  Building project..."
npm run build

cd ..

echo "3️⃣  Switching to gh-pages branch..."
git checkout --orphan gh-pages
git rm -rf .

echo "4️⃣  Copying dist to root..."
cp -r web-app/dist/* .
rm -rf web-app/dist

echo "5️⃣  Committing..."
git add .
git commit -m "Deploy to GitHub Pages [skip ci]"

echo "6️⃣  Pushing gh-pages..."
git push origin gh-pages --force

echo "7️⃣  Switching back to main..."
git checkout main

echo ""
echo "✅ Done!"
echo "🌐 Site should be available at: https://rage4er.github.io/tinkercraft/"
echo "⚙️  Remember to set GitHub Pages → Source: gh-pages branch, Folder: / (root)"
