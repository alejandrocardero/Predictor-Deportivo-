param($envPath = "D:\Proyectos\pronósticos-deportivos-ia")
Push-Location $envPath
$env:PATH = "$envPath\node_modules\.bin;$env:PATH"
& "tsx" "server.ts"
Pop-Location