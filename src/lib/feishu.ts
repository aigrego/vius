import { Alert } from './alerts';

interface FeishuResult {
  sent: boolean;
  message?: string;
}

export async function pushAlertsToFeishu(alerts: Alert[]): Promise<FeishuResult> {
  const webhookUrl = process.env.FEISHU_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.log('Feishu webhook not configured, skipping push');
    return { sent: false, message: 'Webhook not configured' };
  }

  try {
    const alertTexts = alerts.map(alert => {
      const severityEmoji = {
        low: '🔵',
        medium: '🟡',
        high: '🔴'
      }[alert.severity];
      
      return `${severityEmoji} ${alert.message}`;
    });

    const content = {
      msg_type: 'post',
      content: {
        post: {
          zh_cn: {
            title: `🚨 股票预警提醒 (${alerts.length}条)`,
            content: [
              alertTexts.map(text => ({
                tag: 'text',
                text: text + '\n'
              }))
            ]
          }
        }
      }
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(content),
    });

    if (!response.ok) {
      throw new Error(`Feishu API error: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.code !== 0) {
      throw new Error(`Feishu error: ${result.msg}`);
    }

    console.log(`✅ Pushed ${alerts.length} alerts to Feishu`);
    return { sent: true };
  } catch (error) {
    console.error('Failed to push to Feishu:', error);
    return { sent: false, message: (error as Error).message };
  }
}
