@echo off
chcp 65001 >nul
title AI小镇启动器

echo ========================================
echo          🤖 AI小镇启动器
echo ========================================
echo.

REM 检查是否在ai-town目录
if exist "package.json" (
    echo ✅ 当前目录: %cd%
) else (
    echo ❌ 错误: 请在ai-town目录运行此脚本
    echo    当前目录: %cd%
    pause
    exit /b 1
)

REM 检查node_modules是否存在
if not exist "node_modules" (
    echo 📦 首次运行，正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
    echo ✅ 依赖安装完成
    echo.
)

REM 检查.env文件
if not exist ".env" (
    echo ⚠️  警告: 未找到.env文件
    echo    正在从模板创建...
    copy ".env.example" ".env" >nul
    echo ✅ 已创建.env，请编辑配置API密钥
    echo.
)

:menu
echo.
echo ========================================
echo           🎮 主菜单
echo ========================================
echo  1. 开发模式 (热重载) - npm run dev
echo  2. 运行一次 - npm start
echo  3. 运行测试 - npm test
echo  4. 检查代码 - npm run lint
echo  5. 构建项目 - npm run build
echo  6. 数据库设置 - npm run db:setup
echo  7. 打开配置文件 (.env)
echo  8. 退出
echo ========================================
echo.

set /p choice="请选择操作 (1-8): "

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto start
if "%choice%"=="3" goto test
if "%choice%"=="4" goto lint
if "%choice%"=="5" goto build
if "%choice%"=="6" goto dbsetup
if "%choice%"=="7" goto config
if "%choice%"=="8" goto exit
if "%choice%"=="q" goto exit
if "%choice%"=="Q" goto exit

echo ❌ 无效选择，请重新输入
goto menu

:dev
echo.
echo 🚀 启动开发模式 (热重载)...
echo    按 Ctrl+C 停止运行
echo.
call npm run dev
pause
goto menu

:start
echo.
echo 🚀 运行程序...
call npm start
echo.
pause
goto menu

:test
echo.
echo 🧪 运行测试...
call npm test
echo.
pause
goto menu

:lint
echo.
echo 🔍 检查代码...
call npm run lint
echo.
pause
goto menu

:build
echo.
echo 🔨 构建项目...
call npm run build
echo.
pause
goto menu

:dbsetup
echo.
echo 🗄️  数据库设置...
call npm run db:setup
echo.
pause
goto menu

:config
echo.
echo 📝 打开配置文件...
if exist ".env" (
    notepad ".env"
) else (
    echo ❌ 未找到.env文件
)
goto menu

:exit
echo.
echo 👋 再见！
timeout /t 2 >nul
exit /b 0
