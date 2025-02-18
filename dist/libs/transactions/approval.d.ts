import type Web3 from "web3";
import type { TransactionReceipt } from "web3-core";
/**
 * Handle the flow for approval transaction (tx)
 * this is to update the spender allowance before a deposit tx
 *
 * @async
 * @function createAndSubmitApproval
 * @param {*} token An instance of Token holding token data such as contract address
 * @param {string} ownerEthAddress Eth address which may own some token balance
 * @param {undefined | string} ownerEthPrivateKey Eth private key of the sender to sign the tx
 * @param {string} spenderEthAddress Eth address of the Shield smart contract (spender)
 * @param {Web3} web3 web3js instance
 * @param {string} value The amount in Wei of the token to be deposited later
 * @throws {NightfallSdkError} Error while interacting with token contract or while broadcasting tx
 * @returns {Promise<null | TransactionReceipt>} Should resolve `null` if approval is not required, else Eth tx receipt
 */
export declare function createAndSubmitApproval(token: any, // Token,
ownerEthAddress: string, ownerEthPrivateKey: undefined | string, spenderEthAddress: string, web3: Web3, value: string): Promise<null | TransactionReceipt>;
