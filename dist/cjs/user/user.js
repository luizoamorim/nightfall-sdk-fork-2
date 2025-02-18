"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const constants_1 = require("./constants");
const client_1 = require("../client");
const ethereum_1 = require("../ethereum");
const nightfall_1 = require("../nightfall");
const transactions_1 = require("../transactions");
const utils_1 = require("../utils");
const validations_1 = require("./validations");
const error_1 = require("../utils/error");
const nightfall_2 = require("../nightfall");
const logger = utils_1.parentLogger.child({
    name: path_1.default.relative(process.cwd(), __filename),
});
class UserFactory {
    static async create(options) {
        logger.debug("UserFactory :: create");
        // Validate and format options
        const { error, value } = validations_1.createOptions.validate(options);
        (0, validations_1.isInputValid)(error);
        // TODO log value with obfuscation ISSUE #33
        const { clientApiUrl, blockchainWsUrl, ethereumPrivateKey: ethPrivateKey, nightfallMnemonic, } = value;
        // Instantiate Client
        const client = new client_1.Client(clientApiUrl);
        // Get Shield contract address
        const shieldContractAddress = await client.getContractAddress(constants_1.CONTRACT_SHIELD);
        // Set Web3 Provider and Eth account
        // If no private key is given, SDK tries to connect via MetaMask
        let web3Websocket;
        let ethAddress;
        if (!ethPrivateKey) {
            (0, ethereum_1.isMetaMaskAvailable)();
            web3Websocket = new ethereum_1.Web3Websocket();
            ethAddress = await (0, ethereum_1.getEthAccountFromMetaMask)(web3Websocket);
        }
        else {
            web3Websocket = new ethereum_1.Web3Websocket(blockchainWsUrl);
            ethAddress = (0, ethereum_1.getEthAccountAddress)(ethPrivateKey, web3Websocket.web3);
        }
        // Create a set of Zero-knowledge proof keys from a valid mnemonic
        // or from a new mnemonic if none was provided,
        // subscribe to incoming viewing keys
        const nightfallKeys = await (0, nightfall_1.createZkpKeysAndSubscribeToIncomingKeys)(nightfallMnemonic, client);
        return new User({
            client,
            web3Websocket,
            shieldContractAddress,
            ethPrivateKey,
            ethAddress,
            nightfallMnemonic: nightfallKeys.nightfallMnemonic,
            zkpKeys: nightfallKeys.zkpKeys,
        });
    }
}
class User {
    constructor(options) {
        // Set when transacting
        this.nightfallDepositTxHashes = [];
        this.nightfallTransferTxHashes = [];
        this.nightfallWithdrawalTxHashes = [];
        logger.debug("new User");
        let key;
        for (key in options) {
            this[key] = options[key];
        }
    }
    /**
     * Allow user to check client API availability and blockchain ws connection
     *
     * @async
     * @deprecated checkStatus - Will be removed in upcoming versions
     */
    async checkStatus() {
        throw new error_1.NightfallSdkError("To be deprecated: use `isClientAlive`, `isWeb3WsAlive`");
    }
    /**
     * Allow user to check client API availability
     *
     * @async
     * @method isClientAlive
     * @returns {Promise<boolean>}
     */
    async isClientAlive() {
        logger.debug("User :: isClientAlive");
        return this.client.healthCheck();
    }
    /**
     * Allow user to check blockchain ws connection
     *
     * @async
     * @method isWeb3WsAlive
     * @returns {Promise<boolean>}
     */
    async isWeb3WsAlive() {
        logger.debug("User :: isWeb3WsAlive");
        const isWeb3WsAlive = await this.web3Websocket.setEthBlockNo();
        return !!isWeb3WsAlive;
    }
    /**
     * Allow user to retrieve the Nightfall Mnemonic  - Keep this private
     *
     * @method getNightfallMnemonic
     * @returns {string} Nightfall mnemonic
     */
    getNightfallMnemonic() {
        logger.debug("User :: getNightfallMnemonic");
        return this.nightfallMnemonic;
    }
    /**
     * Allow user to retrieve Nightfall Layer2 address
     *
     * @method getNightfallAddress
     * @returns {string} Nightfall Layer2 address
     */
    getNightfallAddress() {
        var _a;
        logger.debug("User :: getNightfallAddress");
        return (_a = this.zkpKeys) === null || _a === void 0 ? void 0 : _a.compressedZkpPublicKey;
    }
    /**
     * [Browser + MetaMask only] Update Ethereum account address
     *
     * @async
     * @method updateEthAccountFromMetamask
     * @returns {string} Ethereum account address
     */
    async updateEthAccountFromMetamask() {
        logger.debug("User :: updateEthAccountFromMetamask");
        if (this.ethPrivateKey)
            throw new error_1.NightfallSdkError("Method not available");
        const ethAddress = await (0, ethereum_1.getEthAccountFromMetaMask)(this.web3Websocket);
        this.ethAddress = ethAddress;
        return ethAddress;
    }
    /**
     * Deposits a Layer 1 token into Layer 2, so that it can be transacted privately
     *
     * @async
     * @method makeDeposit
     * @param {UserMakeDeposit} options
     * @param {string} options.tokenContractAddress
     * @param {string} [options.tokenErcStandard] Will be deprecated
     * @param {string} [options.value]
     * @param {string} [options.tokenId]
     * @param {string} [options.feeWei]
     * @returns {Promise<OnChainTransactionReceipts>}
     */
    async makeDeposit(options) {
        var _a;
        logger.debug({ options }, "User :: makeDeposit");
        // Validate and format options
        const { error, value: joiValue } = validations_1.makeDepositOptions.validate(options);
        (0, validations_1.isInputValid)(error);
        logger.debug({ joiValue }, "makeDeposit formatted parameters");
        const { tokenContractAddress, value, feeWei } = joiValue;
        let { tokenId } = joiValue;
        // Determine ERC standard, set value/tokenId defaults,
        // create an instance of Token, convert value to Wei if needed
        const result = await (0, transactions_1.prepareTokenValueTokenId)(tokenContractAddress, value, tokenId, this.web3Websocket.web3);
        const { token, valueWei } = result;
        tokenId = result.tokenId;
        // Approval
        const approvalReceipt = await (0, transactions_1.createAndSubmitApproval)(token, this.ethAddress, this.ethPrivateKey, this.shieldContractAddress, this.web3Websocket.web3, valueWei);
        if (approvalReceipt)
            logger.info({ approvalReceipt }, "Approval completed!");
        // Deposit
        const depositReceipts = await (0, transactions_1.createAndSubmitDeposit)(token, this.ethAddress, this.ethPrivateKey, this.zkpKeys, this.shieldContractAddress, this.web3Websocket.web3, this.client, valueWei, tokenId, feeWei);
        logger.info({ depositReceipts }, "Deposit completed!");
        this.nightfallDepositTxHashes.push((_a = depositReceipts.txReceiptL2) === null || _a === void 0 ? void 0 : _a.transactionHash);
        return depositReceipts;
    }
    /**
     * Transfers a token within Layer 2
     *
     * @async
     * @method makeTransfer
     * @param {UserMakeTransfer} options
     * @param {string} options.tokenContractAddress
     * @param {string} [options.tokenErcStandard] Will be deprecated
     * @param {string} [options.value]
     * @param {string} [options.tokenId]
     * @param {string} [options.feeWei]
     * @param {string} options.recipientNightfallAddress
     * @param {Boolean} [options.isOffChain]
     * @returns {Promise<OnChainTransactionReceipts | OffChainTransactionReceipt>}
     */
    async makeTransfer(options) {
        var _a;
        logger.debug(options, "User :: makeTransfer");
        // Validate and format options
        const { error, value: joiValue } = validations_1.makeTransferOptions.validate(options);
        (0, validations_1.isInputValid)(error);
        logger.debug({ joiValue }, "makeTransfer formatted parameters");
        const { tokenContractAddress, value, feeWei, recipientNightfallAddress, isOffChain, } = joiValue;
        let { tokenId } = joiValue;
        // Determine ERC standard, set value/tokenId defaults,
        // create an instance of Token, convert value to Wei if needed
        const result = await (0, transactions_1.prepareTokenValueTokenId)(tokenContractAddress, value, tokenId, this.web3Websocket.web3);
        const { token, valueWei } = result;
        tokenId = result.tokenId;
        // Transfer
        const transferReceipts = await (0, transactions_1.createAndSubmitTransfer)(token, this.ethAddress, this.ethPrivateKey, this.zkpKeys, this.shieldContractAddress, this.web3Websocket.web3, this.client, valueWei, tokenId, feeWei, recipientNightfallAddress, isOffChain);
        logger.info({ transferReceipts }, "Transfer completed!");
        this.nightfallTransferTxHashes.push((_a = transferReceipts.txReceiptL2) === null || _a === void 0 ? void 0 : _a.transactionHash);
        return transferReceipts;
    }
    /**
     * Withdraws a token from Layer 2 back to Layer 1. It can then be withdrawn from the Shield contract's account by the owner in Layer 1.
     *
     * @async
     * @method makeWithdrawal
     * @param {UserMakeWithdrawal} options
     * @param {string} options.tokenContractAddress
     * @param {string} [options.tokenErcStandard] Will be deprecated
     * @param {string} [options.value]
     * @param {string} [options.tokenId]
     * @param {string} [options.feeWei]
     * @param {string} options.recipientEthAddress
     * @param {Boolean} [options.isOffChain]
     * @returns {Promise<OnChainTransactionReceipts | OffChainTransactionReceipt>}
     */
    async makeWithdrawal(options) {
        var _a;
        logger.debug({ options }, "User :: makeWithdrawal");
        // Validate and format options
        const { error, value: joiValue } = validations_1.makeWithdrawalOptions.validate(options);
        (0, validations_1.isInputValid)(error);
        logger.debug({ joiValue }, "makeWithdrawal formatted parameters");
        const { tokenContractAddress, value, feeWei, recipientEthAddress, isOffChain, } = joiValue;
        let { tokenId } = joiValue;
        // Determine ERC standard, set value/tokenId defaults,
        // create an instance of Token, convert value to Wei if needed
        const result = await (0, transactions_1.prepareTokenValueTokenId)(tokenContractAddress, value, tokenId, this.web3Websocket.web3);
        const { token, valueWei } = result;
        tokenId = result.tokenId;
        // Withdrawal
        const withdrawalReceipts = await (0, transactions_1.createAndSubmitWithdrawal)(token, this.ethAddress, this.ethPrivateKey, this.zkpKeys, this.shieldContractAddress, this.web3Websocket.web3, this.client, valueWei, tokenId, feeWei, recipientEthAddress, isOffChain);
        logger.info({ withdrawalReceipts }, "Withdrawal completed!");
        this.nightfallWithdrawalTxHashes.push((_a = withdrawalReceipts.txReceiptL2) === null || _a === void 0 ? void 0 : _a.transactionHash);
        return withdrawalReceipts;
    }
    /**
     * Allow user to finalise a previously initiated withdrawal and withdraw funds back to Layer1
     *
     * @async
     * @method finaliseWithdrawal
     * @param {UserFinaliseWithdrawal} options
     * @param {string} [options.withdrawTxHashL2] If not provided, will attempt to use latest withdrawal transaction hash
     * @returns {Promise<TransactionReceipt>}
     */
    async finaliseWithdrawal(options) {
        logger.debug({ options }, "User :: finaliseWithdrawal");
        let withdrawTxHashL2 = "";
        // If options were passed validate and format, else use latest withdrawal hash
        if (options) {
            const { error, value } = validations_1.finaliseWithdrawalOptions.validate(options);
            (0, validations_1.isInputValid)(error);
            withdrawTxHashL2 = value.withdrawTxHashL2;
        }
        else {
            const withdrawalTxHashes = this.nightfallWithdrawalTxHashes;
            withdrawTxHashL2 = withdrawalTxHashes[withdrawalTxHashes.length - 1];
        }
        if (!withdrawTxHashL2)
            throw new error_1.NightfallSdkError("Could not find any withdrawal tx hash");
        logger.debug({ withdrawTxHashL2 }, "Finalise withdrawal with tx hash");
        return (0, transactions_1.createAndSubmitFinaliseWithdrawal)(this.ethAddress, this.ethPrivateKey, this.shieldContractAddress, this.web3Websocket.web3, this.client, withdrawTxHashL2);
    }
    /**
     * Allow user to check the deposits that haven't been processed yet
     *
     * @async
     * @method checkPendingDeposits
     * @param {UserCheckBalances} [options]
     * @param {string[]} [options.tokenContractAddresses] A list of token addresses
     * @returns {Promise<*>} Should resolve into an object containing the aggregated value per token, for deposit tx that have not been included yet in a Layer2 block
     */
    async checkPendingDeposits(options) {
        logger.debug({ options }, "User :: checkPendingDeposits");
        let tokenContractAddresses = [];
        // If options were passed, validate and format
        if (options) {
            const { error, value } = validations_1.checkBalancesOptions.validate(options);
            (0, validations_1.isInputValid)(error);
            tokenContractAddresses = value.tokenContractAddresses;
        }
        logger.debug({ tokenContractAddresses }, "Get pending deposits for token addresses");
        return this.client.getPendingDeposits(this.zkpKeys, tokenContractAddresses);
    }
    /**
     * Allow user to get the total Nightfall Layer2 balance of its commitments
     *
     * @async
     * @method checkNightfallBalances
     * @returns {Promise<*>} Should resolve into an object containing the aggregated value per token, for commitments available in Layer2
     */
    async checkNightfallBalances() {
        logger.debug("User :: checkNightfallBalances");
        return this.client.getNightfallBalances(this.zkpKeys);
    }
    /**
     * Allow user to check the balance of the pending spent commitments on Layer2
     *
     * @async
     * @method checkPendingTransfers
     * @returns {Promise<*>}
     */
    async checkPendingTransfers() {
        logger.debug("User :: checkPendingTransfers");
        return this.client.getPendingTransfers(this.zkpKeys);
    }
    /**
     * Allow user to export commitments
     *
     * @async
     * @method exportCommitments
     * @param {UserExportCommitments} options
     * @param {String[]} options.listOfCompressedZkpPublicKey
     * @param {string} options.pathToExport
     * @param {string} options.fileName
     * @returns {Promise<void | null>}
     */
    async exportCommitments(options) {
        logger.debug({ options }, "User :: exportCommitments");
        try {
            const allCommitmentsByCompressedZkpPublicKey = await this.client.getCommitmentsByCompressedZkpPublicKey(options.listOfCompressedZkpPublicKey);
            if (allCommitmentsByCompressedZkpPublicKey &&
                allCommitmentsByCompressedZkpPublicKey.length > 0) {
                fs_1.default.writeFileSync(`${options.pathToExport}${options.fileName}`, JSON.stringify(allCommitmentsByCompressedZkpPublicKey));
                return;
            }
            logger.warn("Either you don't have any commitments for this listOfCompressedZkpPublicKey or this one is invalid!");
            return null;
        }
        catch (err) {
            logger.child({ options }).error(err, "Error while exporting commitments");
            return null;
        }
    }
    /**
     * Allow user to import commitments
     *
     * @async
     * @method importAndSaveCommitments
     * @param {UserImportCommitments} options
     * @param {string} options.compressedZkpPublicKey
     * @param {string} options.pathToImport
     * @param {string} options.fileName
     * @returns {Promise<string>}
     */
    async importAndSaveCommitments(options) {
        logger.debug({ options }, "User :: importAndSaveCommitments");
        const file = fs_1.default.readFileSync(`${options.pathToImport}${options.fileName}`);
        const listOfCommitments = JSON.parse(file.toString("utf8"));
        (0, nightfall_2.commitmentsFromMnemonic)(listOfCommitments, options.compressedZkpPublicKey);
        const res = await this.client.saveCommitments(listOfCommitments);
        const { successMessage } = res;
        logger.info(successMessage);
        return successMessage;
    }
    /**
     * Close user blockchain ws connection
     */
    close() {
        logger.debug("User :: close");
        this.web3Websocket.close();
    }
}
exports.default = UserFactory;
//# sourceMappingURL=user.js.map