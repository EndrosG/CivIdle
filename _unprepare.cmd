@cd /d "%~dp0"
rmdir /s /q node_modules
rmdir /s /q dist

@cd electron
rmdir /s /q node_modules
rmdir /s /q dist
rmdir /s /q compiled
rmdir /s /q out
rmdir /s /q save

@cd /d "%~dp0"
