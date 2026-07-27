// 历史原因服务端存在 code===200 与 code===0 两套成功码，这里统一兼容
const isSuccessCode = (code: number) => code === 200 || code === 0;

const http = {
  find_: async (url: string, init?: RequestInit) => {
    const resp = await fetch(url, init);
    if (resp.status == 200) {
      const { code, data, message } = await resp.json();
      if(isSuccessCode(code)) return data;
      throw new Error(message);
    } else {
      throw new Error('请求失败');
    }
  },
  findOne_: async (url: string, init?: RequestInit) => {
    const resp = await fetch(url, init);
    if (resp.status == 200) {
      const { code, data, message } = await resp.json();
      if(isSuccessCode(code)) return data;
      throw new Error(message);
    } else {
      throw new Error('请求失败')
    }
  },
  loadFile_: async (url: string, init?: RequestInit) => {
    const resp = await fetch(url, init);
    if (resp.status == 200) {
      return resp.json();
    } else {
      throw new Error('请求失败')
    }
  },

  get: async (url: string, init?: RequestInit) => {
    const resp = await fetch(url, init)
    if (resp.status == 200) {
      const data = await resp.json()
      if (isSuccessCode(data.code)) {
        return data.data
      }
      throw new Error(data.message)
    } else {
      throw new Error('请求失败')
    }
  },

  getAll: async (url: string, init?: RequestInit) => {
    const resp = await fetch(url, init)
    if (resp.status == 200) {
      return resp.json();
    } else {
      throw new Error('请求失败')
    }
  },

  post: async ([url, body]: any[]) => {
    const resp = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (resp.status == 200) {
      const data = await resp.json()
      if (isSuccessCode(data.code)) {
        return data.data
      }
      throw new Error(data.message)
    } else {
      throw new Error('请求失败')
    }
  }

}

export default http
