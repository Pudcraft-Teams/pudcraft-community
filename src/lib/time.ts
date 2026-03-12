import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

/**
 * 将时间转换为简洁的相对时间文案。
 */
export function timeAgo(date: Date | string): string {
  const value = date instanceof Date ? date : new Date(date);

  if (!Number.isFinite(value.getTime())) {
    return "刚刚";
  }

  try {
    return formatDistanceToNow(value, {
      addSuffix: true,
      locale: zhCN,
    }).replace('大约', ''); // remove "大约" form text
  } catch {
    return "刚刚";
  }
}
