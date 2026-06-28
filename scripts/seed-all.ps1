Write-Host "=== E-Learning Platform - Seed All Services ===" -ForegroundColor Cyan

Write-Host ""
Write-Host "[1/9] Prisma db push - Auth Service" -ForegroundColor Yellow
docker exec elearning_auth_service npx prisma db push
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "[2/9] Seeding Auth Service..." -ForegroundColor Yellow
docker exec elearning_auth_service node seed.js
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "[3/9] Prisma db push - Course Service" -ForegroundColor Yellow
docker exec elearning_course_service npx prisma db push
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "[4/9] Seeding Course Service..." -ForegroundColor Yellow
docker exec elearning_course_service node seed.js
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "[5/9] Prisma db push - Quiz Service" -ForegroundColor Yellow
docker exec elearning_quiz_service npx prisma db push
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "[6/9] Seeding Quiz Service..." -ForegroundColor Yellow
docker exec elearning_quiz_service node seed.js
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "[7/9] Prisma db push - Content Service" -ForegroundColor Yellow
docker exec elearning_content_service npx prisma db push
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "[8/9] Prisma db push - Audit Service" -ForegroundColor Yellow
docker exec elearning_audit_service npx prisma db push --schema=prisma/schema.prisma
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "[9/9] Prisma db push - Notification Service" -ForegroundColor Yellow
docker exec elearning_notification_service npx prisma db push
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=== All seeds completed successfully! ===" -ForegroundColor Green
