export function openMaps(address: string) {
  const encoded = encodeURIComponent(address)
  const isApple = /iPad|iPhone|iPod|Mac/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream
  const url = isApple
    ? `maps://?daddr=${encoded}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`
  window.open(url, '_blank')
}
