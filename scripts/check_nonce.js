const hre = require('hardhat');
async function main() {
  const [signer] = await hre.ethers.getSigners();
  const addr = signer.address;
  const pendingNonce = await hre.ethers.provider.getTransactionCount(addr, 'pending');
  const latestNonce = await hre.ethers.provider.getTransactionCount(addr, 'latest');
  console.log('Address:', addr);
  console.log('Confirmed nonce (latest):', latestNonce);
  console.log('Pending nonce:', pendingNonce);
  const feeData = await hre.ethers.provider.getFeeData();
  console.log('gasPrice:', feeData.gasPrice?.toString());
  console.log('maxFeePerGas:', feeData.maxFeePerGas?.toString());
  console.log('maxPriorityFeePerGas:', feeData.maxPriorityFeePerGas?.toString());
}
main().catch(console.error);
