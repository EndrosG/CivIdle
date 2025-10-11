@cd /d "%~dp0"
@cd electron

call npm run build-only
call npm run package-only

@cd /d "%~dp0"
