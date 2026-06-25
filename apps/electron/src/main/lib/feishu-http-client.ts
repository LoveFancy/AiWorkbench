/**
 * 飞书 SDK HTTP 出口。
 *
 * 飞书 node-sdk 底层使用 Axios。Axios 默认代理模式对部分企业 HTTP 代理不会
 * 使用 CONNECT 隧道访问 HTTPS，可能触发 HPE_INVALID_CONSTANT 这类解析错误。
 * 这里显式提供 https-proxy-agent，让 HTTPS 请求按标准 CONNECT 方式穿透代理。
 */

import axios, { type AxiosInstance } from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { getEffectiveProxyUrl } from './proxy-settings-service'

interface FeishuAxiosConfig {
  $return_headers?: boolean
}

export interface FeishuSdkTransport {
  httpInstance: AxiosInstance
  agent?: HttpsProxyAgent
}

async function applyFeishuProxy(httpInstance: AxiosInstance): Promise<HttpsProxyAgent | undefined> {
  const proxyUrl = await getEffectiveProxyUrl()
  httpInstance.defaults.proxy = false

  if (!proxyUrl) {
    delete httpInstance.defaults.httpAgent
    delete httpInstance.defaults.httpsAgent
    return undefined
  }

  const agent = new HttpsProxyAgent(proxyUrl)
  httpInstance.defaults.httpAgent = agent
  httpInstance.defaults.httpsAgent = agent

  console.log('[飞书 SDK] 使用代理:', proxyUrl)
  return agent
}

export async function createFeishuSdkTransport(): Promise<FeishuSdkTransport> {
  const httpInstance = axios.create()

  httpInstance.interceptors.response.use((resp) => {
    const config = resp.config as typeof resp.config & FeishuAxiosConfig
    if (config.$return_headers) {
      return {
        data: resp.data,
        headers: resp.headers,
      }
    }
    return resp.data
  })

  const agent = await applyFeishuProxy(httpInstance)
  return { httpInstance, agent }
}

export async function configureFeishuDefaultHttpInstance(httpInstance: AxiosInstance): Promise<void> {
  await applyFeishuProxy(httpInstance)
}
