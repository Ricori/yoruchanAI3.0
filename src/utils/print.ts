export function printLog(text: string) {
  console.log(`[${new Date().toLocaleString()}]${text}`);
}

export function printError(text: string) {
  console.error(`[${new Date().toLocaleString()}]${text}`);
}