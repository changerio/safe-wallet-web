import { formatUnits } from 'ethers/lib/utils'
import { get } from 'idb-keyval'
import type { MessagePayload } from 'firebase/messaging/sw'
import type { ChainInfo, SafeBalanceResponse, ChainListResponse } from '@safe-global/safe-gateway-typescript-sdk'

import { shortenAddress } from '@/utils/formatters'
import { AppRoutes } from '@/config/routes'
import { isWebhookEvent, WebhookType } from '@/services/firebase/webhooks'
import { getCustomStore } from '@/services/indexed-db'
import type { WebhookEvent } from '@/services/firebase/webhooks'

export const getNotificationPreferencesStore = () => {
  const STORE_NAME = 'notification-preferences'

  return getCustomStore(STORE_NAME)
}

export const shouldShowNotification = async (payload: MessagePayload): Promise<boolean> => {
  if (!isWebhookEvent(payload.data)) {
    return true
  }

  const store = getNotificationPreferencesStore()
  const preference = await get(payload.data.type, store)

  return preference ?? true
}

// XHR is not supported in service workers so we can't use the SDK
const BASE_URL = 'https://safe-client.safe.global'

const getChains = async (): Promise<ChainListResponse | undefined> => {
  const ENDPOINT = `${BASE_URL}/v1/chains`

  const response = await fetch(ENDPOINT)

  if (response.ok) {
    return response.json()
  }
}

const getBalances = async (chainId: string, safeAddress: string): Promise<SafeBalanceResponse | undefined> => {
  const DEFAULT_CURRENCY = 'USD'
  const ENDPOINT = `${BASE_URL}/v1/chains/${chainId}/safes/${safeAddress}/balances/${DEFAULT_CURRENCY}`

  const response = await fetch(ENDPOINT)

  if (response.ok) {
    return response.json()
  }
}

const getLink = (path: string, address: string, chain?: ChainInfo) => {
  const APP_URL = 'https://app.safe.global'

  if (!chain) {
    return APP_URL
  }

  return `${APP_URL}${path}?safe=${chain.shortName}:${address}`
}

export const _parseWebhookNotification = async (
  data: WebhookEvent,
): Promise<{ title: string; body: string; link: string } | undefined> => {
  const { type, chainId, address } = data

  let chains: Array<ChainInfo> | undefined

  try {
    const response = await getChains()
    chains = response?.results
  } catch {}

  const chain = chains?.find((chain) => chain.chainId === chainId)
  const chainName = chain?.chainName ?? `chain ${chainId}`

  const shortSafeAddress = shortenAddress(address)

  const historyLink = getLink(AppRoutes.transactions.history, address, chain)
  const queueLink = getLink(AppRoutes.transactions.queue, address, chain)

  if (type === WebhookType.NEW_CONFIRMATION) {
    const { owner, safeTxHash } = data

    return {
      title: `New confirmation`,
      body: `Safe ${shortSafeAddress} on ${chainName} has a new confirmation from ${shortenAddress(
        owner,
      )} on transaction ${shortenAddress(safeTxHash)}.`,
      link: queueLink,
    }
  }

  if (type === WebhookType.EXECUTED_MULTISIG_TRANSACTION) {
    const { failed, txHash } = data

    const shortTxHash = shortenAddress(txHash)

    if (failed === 'true') {
      return {
        title: `Transaction failed`,
        body: `Safe ${shortSafeAddress} on ${chainName} failed to execute transaction ${shortTxHash}.`,
        link: queueLink,
      }
    } else {
      return {
        title: `Transaction executed`,
        body: `Safe ${shortSafeAddress} on ${chainName} executed transaction ${shortTxHash}.`,
        link: historyLink,
      }
    }
  }

  if (type === WebhookType.PENDING_MULTISIG_TRANSACTION) {
    const { safeTxHash } = data

    return {
      title: `New pending transaction`,
      body: `Safe ${shortSafeAddress} on ${chainName} has a new pending transaction ${shortenAddress(safeTxHash)}.`,
      link: queueLink,
    }
  }

  if (type === WebhookType.INCOMING_ETHER || type === WebhookType.OUTGOING_ETHER) {
    const { txHash, value } = data

    const currencySymbol = chain?.nativeCurrency?.symbol ?? 'ETH'
    const currencyValue = formatUnits(value, chain?.nativeCurrency?.decimals).toString()
    const currencyName = chain?.nativeCurrency?.name ?? 'Ether'

    const shortTxHash = shortenAddress(txHash)

    if (type === WebhookType.INCOMING_ETHER) {
      return {
        title: `${currencyName} received`,
        body: `Safe ${shortSafeAddress} on ${chainName} received ${currencyValue} ${currencySymbol} in transaction ${shortTxHash}.`,
        link: historyLink,
      }
    }

    if (type === WebhookType.OUTGOING_ETHER) {
      return {
        title: `${currencyName} sent`,
        body: `Safe ${shortSafeAddress} on ${chainName} sent ${currencyValue} ${currencySymbol} in transaction ${shortTxHash}.`,
        link: historyLink,
      }
    }
  }

  if (type === WebhookType.INCOMING_TOKEN || type === WebhookType.OUTGOING_TOKEN) {
    const { tokenAddress, txHash, value } = data

    let balances: SafeBalanceResponse | undefined

    try {
      balances = await getBalances(chainId, address)
    } catch {}

    const tokenInfo = balances?.items.find((token) => token.tokenInfo.address === tokenAddress)?.tokenInfo

    const tokenSymbol = tokenInfo?.symbol ?? 'tokens'
    const tokenValue = value && tokenInfo ? formatUnits(value, tokenInfo.decimals).toString() : 'some'
    const tokenName = tokenInfo?.name ?? 'Token'

    const shortTxHash = shortenAddress(txHash)

    if (type === WebhookType.INCOMING_TOKEN) {
      return {
        title: `${tokenName} received`,
        body: `Safe ${shortSafeAddress} on ${chainName} received ${tokenValue} ${tokenSymbol} in transaction ${shortTxHash}.`,
        link: historyLink,
      }
    }

    if (type === WebhookType.OUTGOING_TOKEN) {
      return {
        title: `${tokenName} sent`,
        body: `Safe ${shortSafeAddress} on ${chainName} sent ${tokenValue} ${tokenSymbol} in transaction ${shortTxHash}.`,
        link: historyLink,
      }
    }
  }

  if (type === WebhookType.MODULE_TRANSACTION) {
    const { module, txHash } = data

    return {
      title: `Module transaction`,
      body: `Safe ${shortSafeAddress} on ${chainName} executed a module transaction ${shortenAddress(
        txHash,
      )} from module ${shortenAddress(module)}.`,
      link: historyLink,
    }
  }

  if (type === WebhookType.CONFIRMATION_REQUEST) {
    const { safeTxHash } = data

    return {
      title: `Confirmation request`,
      body: `Safe ${shortSafeAddress} on ${chainName} has a new confirmation request for transaction ${shortenAddress(
        safeTxHash,
      )}.`,
      link: queueLink,
    }
  }

  if (type === WebhookType.SAFE_CREATED) {
    // Notifications are subscribed to per Safe so we would only show this notification
    // if the user was subscribed to a pre-determined address
  }
}

export const parseFirebaseNotification = async (
  payload: MessagePayload,
): Promise<({ title: string; link?: string } & NotificationOptions) | undefined> => {
  // Transaction Service-dispatched notification
  if (isWebhookEvent(payload.data)) {
    const webhookNotification = await _parseWebhookNotification(payload.data)

    if (webhookNotification) {
      return {
        title: webhookNotification.title,
        body: webhookNotification.body,
        link: webhookNotification.link,
      }
    }
  }

  // Firebase-dispatched notification
  if (payload.notification) {
    return {
      title: payload.notification.title || '',
      body: payload.notification.body,
      image: payload.notification.image,
    }
  }
}
