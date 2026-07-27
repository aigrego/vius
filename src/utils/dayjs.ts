import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

// 统一配置：中文 locale + fromNow() 相对时间插件
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

export default dayjs;
