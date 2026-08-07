// pm2 的 log_date_format 已经给每行加时间戳了，这里不再重复加
export function printLog(message: string, ...optionalParams: any[]) {
  console.log(message, ...optionalParams);
}

export function printError(message: string, ...optionalParams: any[]) {
  console.error(message, ...optionalParams);
}
