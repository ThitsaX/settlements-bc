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

import {
	ISettlementConfigRepo,
	ISettlementBatchRepo,
	ISettlementBatchAccountRepo,
	IParticipantAccountNotifier,
	ISettlementTransferRepo,
	ISettlementMatrixRequestRepo
} from "@mojaloop/settlements-bc-domain-lib";
import {ConsoleLogger, ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {AuxiliarySettlementsHttpClient} from "./auxiliary_settlements_http_client";
import {randomUUID} from "crypto";
import {IAuthorizationClient} from "@mojaloop/security-bc-public-types-lib";
import {
	AuditClientMock,
	AuthenticationServiceMock,
	AuthorizationClientMock,
	SettlementConfigRepoMock,
	SettlementBatchRepoMock,
	SettlementBatchAccountRepoMock,
	ParticipantAccountNotifierMock,
	SettlementTransferRepoMock,
	SettlementMatrixRequestRepoMock
} from "@mojaloop/settlements-bc-shared-mocks-lib";
import {startHttpService, stopHttpService} from "../../src/http_svc";
import {
	ISettlementTransferDto
} from "@mojaloop/settlements-bc-public-types-lib";

const BASE_URL_SETTLEMENTS_HTTP_SERVICE: string = "http://localhost:1234";
const TIMEOUT_MS_SETTLEMENTS_HTTP_CLIENT: number = 5_000;

let authorizationClient: IAuthorizationClient;
let configRepo: ISettlementConfigRepo;
let settleBatchRepo: ISettlementBatchRepo;
let settleBatchAccRepo: ISettlementBatchAccountRepo;
let settleTransferRepo: ISettlementTransferRepo;
let settleMatrixReqRepo: ISettlementMatrixRequestRepo;
let partNotifier: IParticipantAccountNotifier;

let auxiliarySettlementsHttpClient: AuxiliarySettlementsHttpClient;

describe("settlements http service - unit tests", () => {
	beforeAll(async () => {
		// Cross Cutting:
		const logger: ILogger = new ConsoleLogger();
		const authenticationServiceMock: AuthenticationServiceMock = new AuthenticationServiceMock(logger);
		authorizationClient = new AuthorizationClientMock(logger);
		const auditingClient: IAuditClient = new AuditClientMock(logger);

		// Mock Repos:
		configRepo = new SettlementConfigRepoMock();
		settleBatchRepo = new SettlementBatchRepoMock();
		settleBatchAccRepo = new SettlementBatchAccountRepoMock();
		settleTransferRepo = new SettlementTransferRepoMock();
		settleMatrixReqRepo = new SettlementMatrixRequestRepoMock();

		partNotifier = new ParticipantAccountNotifierMock();

		// Start Service:
		await startHttpService(
			logger,
			authorizationClient,
			auditingClient,
			configRepo,
			settleBatchRepo,
			settleBatchAccRepo,
			partNotifier,
			settleTransferRepo,
			settleMatrixReqRepo
		);
		auxiliarySettlementsHttpClient = new AuxiliarySettlementsHttpClient(
			logger,
			BASE_URL_SETTLEMENTS_HTTP_SERVICE,
			TIMEOUT_MS_SETTLEMENTS_HTTP_CLIENT,
			AuthenticationServiceMock.VALID_ACCESS_TOKEN
		);
	});

	afterAll(async () => {
		await stopHttpService();
	});

	// Create Settlement Transfer.
	test("create settlement transfer", async () => {
		const transferId: string = randomUUID();
		const debitAcc: string = randomUUID();
		const creditAcc: string = randomUUID();
		const transferDto: ISettlementTransferDto = {
			id: null,
			transferId: transferId,
			currencyCode: 'EUR',
			currencyDecimals: 2,
			amount: "10000", //100 EURO
			debitParticipantAccountId: debitAcc,
			creditParticipantAccountId: creditAcc,
			timestamp: Date.now(),
			settlementModel: "DEFAULT",
			batch: null
		};
		const statusCodeResponse: number = await auxiliarySettlementsHttpClient.createSettlementTransfer(transferDto);
		expect(statusCodeResponse).toEqual(201);
	});
});
