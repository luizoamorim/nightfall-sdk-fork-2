import Joi, { CustomHelpers, ValidationError } from "joi";
import { NightfallSdkError } from "../utils/error";
import { checkAddressChecksum } from "web3-utils";
import { TX_FEE_ETH_WEI_DEFAULT, TX_FEE_MATIC_WEI_DEFAULT } from "./constants";

const isChecksum = (ethAddress: string, helpers: CustomHelpers) => {
  const isValid = checkAddressChecksum(ethAddress);
  if (!isValid)
    return helpers.message({ custom: "Invalid checksum, review ethAddress" });
  return ethAddress;
};

// See https://joi.dev/tester/

const PATTERN_ETH_PRIVATE_KEY = /^0x[0-9a-f]{64}$/;
export const createOptions = Joi.object({
  clientApiUrl: Joi.string().trim().required(),
  blockchainWsUrl: Joi.string().trim(),
  ethereumPrivateKey: Joi.string().trim().pattern(PATTERN_ETH_PRIVATE_KEY),
  nightfallMnemonic: Joi.string().trim(),
}).with("ethereumPrivateKey", "blockchainWsUrl");

const makeTransaction = Joi.object({
  tokenContractAddress: Joi.string()
    .trim()
    .custom(isChecksum, "custom validation")
    .required(),
  tokenErcStandard: Joi.string(), // keep it for a while for compatibility
  value: Joi.string(),
  tokenId: Joi.string(),
  feeWei: Joi.string().default(TX_FEE_ETH_WEI_DEFAULT),
}).or("value", "tokenId"); // these cannot have default

export const makeDepositOptions = makeTransaction;

export const makeTransferOptions = makeTransaction.append({
  feeWei: Joi.string().default(TX_FEE_MATIC_WEI_DEFAULT),
  recipientNightfallAddress: Joi.string().trim().required(), // ISSUE #76
  isOffChain: Joi.boolean().default(false),
});

export const makeWithdrawalOptions = makeTransaction.append({
  feeWei: Joi.string().default(TX_FEE_MATIC_WEI_DEFAULT),
  recipientEthAddress: Joi.string()
    .trim()
    .custom(isChecksum, "custom validation")
    .required(),
  isOffChain: Joi.boolean().default(false),
});

export const finaliseWithdrawalOptions = Joi.object({
  withdrawTxHashL2: Joi.string().trim(),
});

export const checkBalancesOptions = Joi.object({
  tokenContractAddresses: Joi.array().items(
    Joi.string().trim().custom(isChecksum, "custom validation"),
  ),
});

export function isInputValid(error: ValidationError | undefined) {
  if (error !== undefined) {
    const message = error.details.map((e) => e.message).join();
    // TODO log error ISSUE #33
    throw new NightfallSdkError(message);
  }
}
