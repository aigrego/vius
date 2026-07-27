import * as React from 'react';

/* 从 orioles-service 精简迁移：只保留股票相关页面用到的 Loading 图标。 */
export const Loading = ({ alt = '加载中', ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
    return <img src={"https://d.innev.cn/icons/1.0.0/loading.svg"} alt={alt} {...props} />
}
