export function convertTemperatureValue(value, unit) {
  const numericValue = Number(value)

  if (Number.isNaN(numericValue)) {
    return 0
  }

  if (unit === "fahrenheit") {
    return Math.round((numericValue * 9) / 5 + 32)
  }

  return Math.round(numericValue)
}

export function buildSmoothPath(points) {
  if (!points.length) {
    return ""
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`
  }

  let path = `M ${points[0].x} ${points[0].y}`

  for (let index = 0; index < points.length - 1; index += 1) {
    const currentPoint = points[index]
    const nextPoint = points[index + 1]
    const controlX = (currentPoint.x + nextPoint.x) / 2

    path += ` C ${controlX} ${currentPoint.y}, ${controlX} ${nextPoint.y}, ${nextPoint.x} ${nextPoint.y}`
  }

  return path
}

export function buildAreaPath(points, baselineY) {
  if (!points.length) {
    return ""
  }

  return `${buildSmoothPath(points)} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
}