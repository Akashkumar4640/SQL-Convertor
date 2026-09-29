foreach ($port in @(3000, 5000)) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Freed port $port (PID $($conn.OwningProcess))"
  } else {
    Write-Host "Port $port is already free"
  }
}
