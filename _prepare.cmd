@cd /d "%~dp0"

call pnpm install
call pnpm install memoizee

@cd electron

call npm install
call npm install @types/node@18


@cd /d "%~dp0"
