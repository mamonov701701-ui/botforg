# Serveo.net - SSH туннели БЕЗ регистрации и БЕЗ пароля
param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173
)

# Запуск SSH туннелей через serveo.net
Write-Output "Starting serveo tunnels..."
Write-Output ""
Write-Output "BACKEND: ssh -R 80:localhost:$BackendPort serveo.net"
Write-Output "FRONTEND: ssh -R 80:localhost:$FrontendPort serveo.net"
Write-Output ""
Write-Output "URLs появятся в выводе SSH"
Write-Output ""

# Альтернатива - вывод команд для ручного запуска
Write-Output "BACKEND_URL=Run: ssh -R 80:localhost:8000 serveo.net"
Write-Output "FRONTEND_URL=Run: ssh -R 80:localhost:5173 serveo.net"

