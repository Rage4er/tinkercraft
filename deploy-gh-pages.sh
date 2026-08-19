#!/bin/bash
set -e

echo "🚀 Deploy to GitHub Pages"
echo "========================="

# 1. Устанавливаем зависимости
echo "1️⃣  Installing dependencies..."
cd web-app
if command -v pnpm &> /dev/null; then
  pnpm install
elif command -v yarn &> /dev/null; then
  yarn install
else
  npm install
fi

# 2. Собираем проект
echo "2️⃣  Building project..."
if command -v pnpm &> /dev/null; then
  pnpm build
elif command -v yarn &> /dev/null; then
  yarn build
else
  npm run build
fi

# 3. Возвращаемся в корень
cd ..

# 4. Создаём или переключаемся на ветку gh-pages
echo "3️⃣  Switching to gh-pages branch..."
git checkout gh-pages 2>/dev/null || git checkout --orphan gh-pages

# 5. Очищаем всё
echo "4️⃣  Cleaning old files..."
git rm -rf . 2>/dev/null || true

# 6. Копируем файлы
echo "5️⃣  Copying files..."
cp -r web-app/dist/* .

# 7. Добавляем и коммитим
echo "6️⃣  Committing..."
git add .
git commit -m "Deploy to GitHub Pages [skip ci]"

# 8. Пушим
echo "7️⃣  Pushing to gh-pages..."
git push origin gh-pages --force

# 9. Возвращаемся в main
echo "8️⃣  Switching back to main..."
git checkout main

echo ""
echo "✅ Deploy complete!"
echo "🌐 App: https://rage4er.github.io/tinkercraft/"
