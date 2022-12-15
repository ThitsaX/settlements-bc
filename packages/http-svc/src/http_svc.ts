/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Coil
 * - Jason Bruwer <jason.bruwer@coil.com>

 --------------
 ******/

"use strict";

import {ILogger, LogLevel} from "@mojaloop/logging-bc-public-types-lib";
import {KafkaLogger} from "@mojaloop/logging-bc-client-lib";
import {
	Aggregate,
	ISettlementConfigRepo,
	ISettlementBatchRepo,
	ISettlementBatchAccountRepo,
	ISettlementTransferRepo,
	Privileges
} from "@mojaloop/settlements-bc-domain-lib";
import {MongoSettlementConfigRepo} from "@mojaloop/settlements-bc-infrastructure-lib";
import {
	AuditClient,
	KafkaAuditClientDispatcher,
	LocalAuditClientCryptoProvider
} from "@mojaloop/auditing-bc-client-lib";
import {MLKafkaRawProducerOptions} from "@mojaloop/platform-shared-lib-nodejs-kafka-client-lib";
import {existsSync} from "fs";
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {AuthorizationClient, TokenHelper} from "@mojaloop/security-bc-client-lib";
import {IAuthorizationClient} from "@mojaloop/security-bc-public-types-lib";
import {ExpressHttpServer} from "./http_server/express_http_server";
import {AuthorizationClientMock} from "@mojaloop/accounts-and-balances-bc-shared-mocks-lib";

/* ********** Constants Begin ********** */

// General.
const BOUNDED_CONTEXT_NAME: string = "settlements-bc";
const SERVICE_NAME: string = "http-svc";
const SERVICE_VERSION: string = "0.0.1";

// Message broker.
const MESSAGE_BROKER_HOST: string = process.env.SETTLEMENTS_MESSAGE_BROKER_HOST ?? "localhost";
const MESSAGE_BROKER_PORT_NO: number =
	parseInt(process.env.SETTLEMENTS_MESSAGE_BROKER_PORT_NO ?? "") || 9099;
const MESSAGE_BROKER_URL: string = `${MESSAGE_BROKER_HOST}:${MESSAGE_BROKER_PORT_NO}`;

// Logging.
const LOGGING_LEVEL: LogLevel = LogLevel.INFO;
const LOGGING_TOPIC: string = process.env.SETTLEMENTS_LOGGING_TOPIC ?? "logs";

// Token helper. TODO: names and values.
const TOKEN_HELPER_ISSUER_NAME: string =
	process.env.SETTLEMENTS_TOKEN_HELPER_ISSUER_NAME ?? "http://localhost:3201/";
const TOKEN_HELPER_JWKS_URL: string =
	process.env.SETTLEMENTS_TOKEN_HELPER_JWKS_URL ?? "http://localhost:3201/.well-known/jwks.json";
const TOKEN_HELPER_AUDIENCE: string =
	process.env.SETTLEMENTS_TOKEN_HELPER_AUDIENCE ?? "mojaloop.vnext.default_audience";

// Authorization.
const AUTHORIZATION_SERVICE_HOST: string = "localhost";
const AUTHORIZATION_SERVICE_PORT_NO: number = 3202;
const BASE_URL_AUTHORIZATION_SERVICE: string
	= process.env.SETTLEMENTS_TOKEN_HELPER_AUDIENCE
	?? `http://${AUTHORIZATION_SERVICE_HOST}:${AUTHORIZATION_SERVICE_PORT_NO}`;

// Auditing.
const AUDITING_CERT_FILE_PATH: string =
	process.env.SETTLEMENTS_AUDITING_CERT_FILE_PATH ?? "./auditing_cert"; // TODO: file name.
const AUDITING_TOPIC: string = process.env.SETTLEMENTS_AUDITING_TOPIC ?? "audits";

// Data base.
const DB_HOST: string = process.env.SETTLEMENTS_DB_HOST ?? "localhost";
const DB_PORT_NO: number =
	parseInt(process.env.SETTLEMENTS_DB_PORT_NO ?? "") || 27018;
const DB_URL: string = `mongodb://${DB_HOST}:${DB_PORT_NO}`;
const DB_NAME: string = "settlements";
const SETTLEMENT_CONFIGS_COLLECTION_NAME: string = "accounts";

// Server.
const HTTP_SERVER_HOST: string = process.env.SETTLEMENTS_HTTP_SERVER_HOST || "localhost";
const HTTP_SERVER_PORT_NO: number = parseInt(process.env.SETTLEMENTS_HTTP_SERVER_PORT_NO || "") || 1234;

/* ********** Constants End ********** */

let logger: ILogger;
let auditingClient: IAuditClient;

let configRepo: ISettlementConfigRepo;
let batchRepo: ISettlementBatchRepo;
let accountRepo: ISettlementBatchAccountRepo;
let transferRepo: ISettlementTransferRepo;

let httpServer: ExpressHttpServer;

export async function startHttpService(
	_logger?: ILogger,
	authorizationClient?: IAuthorizationClient,
	_auditingClient?: IAuditClient,
	_configRepo?: ISettlementConfigRepo,
	_batchRepo?: ISettlementBatchRepo,
	_accountRepo?: ISettlementBatchAccountRepo,
	_transferRepo?: ISettlementTransferRepo
): Promise<void> {
	// Message producer options.
	const kafkaProducerOptions: MLKafkaRawProducerOptions = {
		kafkaBrokerList: MESSAGE_BROKER_URL
	};

	// Logger.
	if (_logger !== undefined) {
		logger = _logger;
	} else {
		logger = new KafkaLogger(
			BOUNDED_CONTEXT_NAME,
			SERVICE_NAME,
			SERVICE_VERSION,
			kafkaProducerOptions,
			LOGGING_TOPIC,
			LOGGING_LEVEL
		);
		try {
			await (logger as KafkaLogger).init();
		} catch (error: unknown) {
			logger.fatal(error);
			await stopHttpService();
			process.exit(-1); // TODO: verify code.
		}
	}

	// Token helper.
	const tokenHelper: TokenHelper = new TokenHelper(
		TOKEN_HELPER_ISSUER_NAME,
		TOKEN_HELPER_JWKS_URL,
		TOKEN_HELPER_AUDIENCE,
		logger
	);
	try {
		await tokenHelper.init();
	} catch (error: unknown) {
		logger.fatal(error);
		await stopHttpService();
		process.exit(-1); // TODO: verify code.
	}

	// Authorization.
	/*if (authorizationClient === undefined) {
		authorizationClient = new AuthorizationClient(
			BOUNDED_CONTEXT_NAME,
			SERVICE_NAME,
			SERVICE_VERSION,
			BASE_URL_AUTHORIZATION_SERVICE,
			logger
		);
		addPrivileges(authorizationClient as AuthorizationClient);
		await (authorizationClient as AuthorizationClient).bootstrap(true);
		await (authorizationClient as AuthorizationClient).fetch();
	}*/
	// TODO: remove.
	if (authorizationClient === undefined) {
		authorizationClient = new AuthorizationClientMock(logger);
	}

	// Auditing.
	if (_auditingClient !== undefined) {
		auditingClient = _auditingClient;
	} else {
		if (!existsSync(AUDITING_CERT_FILE_PATH)) {
			// TODO: clarify.
			/*if (PRODUCTION_MODE) {
				process.exit(9); // TODO: verify code.
			}*/
			LocalAuditClientCryptoProvider.createRsaPrivateKeyFileSync(AUDITING_CERT_FILE_PATH, 2048); // TODO: Put this in a constant.
		}
		const cryptoProvider: LocalAuditClientCryptoProvider =
			new LocalAuditClientCryptoProvider(AUDITING_CERT_FILE_PATH);
		const auditDispatcher: KafkaAuditClientDispatcher =
			new KafkaAuditClientDispatcher(kafkaProducerOptions, AUDITING_TOPIC, logger);
		auditingClient = new AuditClient(
			BOUNDED_CONTEXT_NAME,
			SERVICE_NAME,
			SERVICE_VERSION,
			cryptoProvider,
			auditDispatcher
		);
		try {
			await auditingClient.init();
		} catch (error: unknown) {
			logger.fatal(error);
			await stopHttpService();
			process.exit(-1); // TODO: verify code.
		}
	}

	// Repos.
	if (_configRepo !== undefined) {
		configRepo = _configRepo;
	} else {
		configRepo = new MongoSettlementConfigRepo(
			logger,
			DB_URL,
			DB_NAME,
			SETTLEMENT_CONFIGS_COLLECTION_NAME
		);
		try {
			await configRepo.init();
		} catch (error: unknown) {
			logger.fatal(error);
			await stopHttpService();
			process.exit(-1); // TODO: verify code.
		}
	}
	if (_batchRepo !== undefined) {
		batchRepo = _batchRepo;
	} else {
		
	}

	if (_accountRepo !== undefined) {
		accountRepo = _accountRepo;
	} else {
		// TODO Init the A+B BC for Accounts.
	}

	if (_transferRepo !== undefined) {
		transferRepo = _transferRepo;
	} else {
		// TODO Init the A+B BC for Transfers.
	}

	// Aggregate:
	const aggregate: Aggregate = new Aggregate(
		logger,
		authorizationClient,
		auditingClient,
		batchRepo,
		accountRepo,
		transferRepo,
		configRepo
	);

	// HTTP server.
	httpServer = new ExpressHttpServer(
		logger,
		tokenHelper,
		aggregate,
		HTTP_SERVER_HOST,
		HTTP_SERVER_PORT_NO
	);
	try {
		await httpServer.stop();
		await httpServer.start();
		/*await httpServer.stop();
		await httpServer.start();
		await httpServer.start();
		await httpServer.stop();
		await httpServer.stop();*/
	} catch (error: unknown) {
		logger.fatal(error);
		await stopHttpService();
		process.exit(-1); // TODO: verify code.
	}
}

function addPrivileges(authorizationClient: AuthorizationClient): void {
	authorizationClient.addPrivilege(
		Privileges.CREATE_ACCOUNT,
		"CREATE_ACCOUNT",
		"Allows the creation of accounts."
	);
	authorizationClient.addPrivilege(
		Privileges.CREATE_JOURNAL_ENTRY,
		"CREATE_JOURNAL_ENTRY",
		"Allows the creation of journal entries." // TODO: @jason, add correct ones.
	);
	authorizationClient.addPrivilege(
		Privileges.VIEW_ACCOUNT,
		"VIEW_ACCOUNT",
		"Allows the retrieval of accounts." // TODO: @jason, add correct ones.
	);
	authorizationClient.addPrivilege(
		Privileges.VIEW_JOURNAL_ENTRY,
		"VIEW_JOURNAL_ENTRY",
		"Allows the retrieval of journal entries." // TODO: @jason, add correct ones.
	);
}

// TODO: verify ifs.
export async function stopHttpService() {
	if (httpServer) await httpServer.stop();
	if (configRepo) await configRepo.destroy();
	if (batchRepo) await batchRepo.destroy();
	if (accountRepo) await accountRepo.destroy();
	if (transferRepo) await transferRepo.destroy();
	if (auditingClient) await auditingClient.destroy();
	if (logger instanceof KafkaLogger) await logger.destroy();
}

process.on("SIGINT", handleSignals); // SIGINT = 2 (Ctrl + c).
process.on("SIGTERM", handleSignals); // SIGTERM = 15.
async function handleSignals(signal: NodeJS.Signals): Promise<void> {
	logger.info(`${signal} received`);
	await stopHttpService();
	process.exit();
}
process.on("exit", () => {
	console.info(`exiting ${SERVICE_NAME}`);
});