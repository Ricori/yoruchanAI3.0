export function printLog(message: string, ...optionalParams: any[]) {
  console.log(`[${new Date().toLocaleString()}]${message}`, ...optionalParams);
}

export function printError(message: string, ...optionalParams: any[]) {
  console.error(`[${new Date().toLocaleString()}]${message}`, ...optionalParams);
}
