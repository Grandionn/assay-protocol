import { ethers } from 'ethers';

export function truncateAddress(address, start = 6, end = 4) {
  if (!address) {
    return '';
  }

  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

export function formatUsdc(value, options = {}) {
  const amount = Number(ethers.formatUnits(normalizeBigInt(value), 6));
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  });

  return `${formatter.format(amount)} USDC`;
}

export function formatUsdcCompact(value) {
  const amount = Number(ethers.formatUnits(normalizeBigInt(value), 6));
  const formatter = new Intl.NumberFormat('en-US', {
    notation: amount >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: amount >= 1000 ? 1 : 2,
  });

  return `${formatter.format(amount)} USDC`;
}

export function formatPercent(value, decimals = 1) {
  return `${Number(value).toFixed(decimals)}%`;
}

export function formatUsd(value, decimals = 2) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return formatter.format(Number(value));
}

export function formatDateTime(value) {
  if (!value) {
    return 'Pending';
  }

  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatRelativeTime(value) {
  if (!value) {
    return 'Moments ago';
  }

  const timestamp = typeof value === 'number' ? value * 1000 : new Date(value).getTime();
  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absSeconds = Math.abs(deltaSeconds);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (absSeconds < 60) {
    return rtf.format(Math.round(deltaSeconds), 'second');
  }

  if (absSeconds < 3600) {
    return rtf.format(Math.round(deltaSeconds / 60), 'minute');
  }

  if (absSeconds < 86400) {
    return rtf.format(Math.round(deltaSeconds / 3600), 'hour');
  }

  return rtf.format(Math.round(deltaSeconds / 86400), 'day');
}

function normalizeBigInt(value) {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === 'string') {
    return BigInt(value);
  }

  return BigInt(value ?? 0);
}
