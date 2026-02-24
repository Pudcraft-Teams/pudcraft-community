/**
 * 将时间转换为简洁的相对时间文案。
 */
export function timeAgo(date: Date | string): string {
  const value = date instanceof Date ? date : new Date(date);
  const timestamp = value.getTime();

  if (!Number.isFinite(timestamp)) {
    return "刚刚";
  }

  const diffMs = Math.max(0, Date.now() - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (diffMs < minute) {
    return "刚刚";
  }
  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)} 分钟前`;
  }
  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)} 小时前`;
  }
  if (diffMs < month) {
    return `${Math.floor(diffMs / day)} 天前`;
  }
  if (diffMs < year) {
    return `${Math.floor(diffMs / month)} 月前`;
  }

  return `${Math.floor(diffMs / year)} 年前`;
}
