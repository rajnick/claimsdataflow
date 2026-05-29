import React, { useMemo, useState } from 'react';
import './App.css';

const INITIAL_SOURCE_FILE = {
  fileName: 'AIA_AIO_claim_26M03.csv',
  channel: 'UI Upload',
  cedent: 'AIA',
  reportingPeriod: '2026-03',
  uploadedBy: 'demo.user@gsrs.local',
  rows: [
    {
      POLNUM: 'POL-1010001',
      CLMNUM: 'CLM-900245',
      ORIGNCOD: 'AIA-LIFE-01',
      INSNAME: 'Li Wei',
      IDNO: 'CN-********1234',
      CLMNOTI: '2026-01-12',
      INCDAT: '2026-01-08',
      ICD_CODE: 'I21.9',
      COVAMT: 1000000,
      NAR: 850000,
      RETENTION: 430000,
      BARREIN: 420000,
      STLAMT: 420000,
      PAYDTE: '2026-03-28',
      CLAIM_STATUS: 'SETTLEMENT_CONFIRMED',
      BENEFIT_CODE: 'CI',
    },
  ],
};

const TREATY_DOCUMENT = {
  documentId: 'TRTY-AIA-2026-LIFE-CI-001',
  treatyReference: 'AIA-LIFE-CI-QS-2026',
  cedent: 'AIA',
  productOrgCode: 'AIA-LIFE-01',
  benefitCode: 'CI',
  treatySection: 'Section 4.2 - Critical Illness Benefits',
  reinsuranceBasis: 'Quota Share',
  reinsurerSharePct: 42,
  recoveryBasis: 'BARREIN amount capped by treaty retention',
  effectiveFrom: '2026-01-01',
};

const CANONICAL_MAPPING = {
  POLNUM: 'policyNumber',
  CLMNUM: 'claimNumber',
  ORIGNCOD: 'productOrgCode',
  INSNAME: 'insuredName',
  IDNO: 'insuredIdentifierMasked',
  CLMNOTI: 'claimNotificationDate',
  INCDAT: 'incidentDate',
  ICD_CODE: 'diagnosisCode',
  COVAMT: 'sumAssured',
  NAR: 'netAmountAtRisk',
  RETENTION: 'retentionAmount',
  BARREIN: 'cededAmount',
  STLAMT: 'settlementAmount',
  PAYDTE: 'paymentDate',
  CLAIM_STATUS: 'sourceClaimStatus',
  BENEFIT_CODE: 'benefitCode',
};

const PIPELINE_STEPS = [
  {
    id: 'upload',
    stage: '1',
    shortTitle: 'Upload',
    title: 'Data Uploaded',
    layer: 'Landing',
    technology: 'UI Upload / Backend Integration',
    explanation: 'GSRS receives the AIA cedent account claim file or event. At this point, the platform has not changed the business data. It only captures the incoming file, who uploaded it, when it arrived, and which route it came through.',
  },
  {
    id: 'register',
    stage: '2',
    shortTitle: 'Register',
    title: 'Ingestion Registered',
    layer: 'Control',
    technology: 'ADF-style orchestration control',
    explanation: 'GSRS creates a controlled run ID and file ID so the upload can be traced end-to-end. This makes the processing auditable and allows the same run to be checked, replayed, or stopped.',
  },
  {
    id: 'bronze',
    stage: '3',
    shortTitle: 'Bronze',
    title: 'Raw Data Stored',
    layer: 'Bronze Delta',
    technology: 'Delta Lake Bronze table',
    explanation: 'The raw AIA file is stored exactly as received. No business meaning is changed. Bronze gives GSRS an immutable audit trail and a safe replay point if later mapping or validation logic changes.',
  },
  {
    id: 'mapping',
    stage: '4',
    shortTitle: 'Mapping',
    title: 'Source-to-Target Mapping',
    layer: 'Canonical Model',
    technology: 'Mapping rules / canonical claim model',
    explanation: 'GSRS maps AIA field names to the canonical claim model. This is where POLNUM becomes policyNumber, CLMNUM becomes claimNumber, and ORIGNCOD becomes productOrgCode. Unmapped mandatory fields are highlighted before technical checks continue.',
  },
  {
    id: 'technical',
    stage: '5',
    shortTitle: 'Tech Check',
    title: 'Technical Validation',
    layer: 'Validation',
    technology: 'Databricks-style validation rules',
    explanation: 'GSRS checks whether the canonical record is technically usable. It validates mandatory fields, numeric values, date formats, duplicates, and structural quality. Records that fail are sent to technical exceptions.',
  },
  {
    id: 'silver',
    stage: '6',
    shortTitle: 'Silver',
    title: 'Silver Claim History Created',
    layer: 'Silver Delta',
    technology: 'Silver operational Delta table',
    explanation: 'GSRS writes the technically valid canonical claim into Silver. Silver stores the full cumulative operational history, using policyNumber + productOrgCode + claimNumber as the business key. This is the operational history layer that the UI can read from.',
  },
  {
    id: 'treaty',
    stage: '7',
    shortTitle: 'Treaty Enrich',
    title: 'Treaty Enrichment',
    layer: 'Enrichment',
    technology: 'Treaty parser / enrichment rules',
    explanation: 'GSRS enriches the Silver claim record using treaty document data that is not present in the cedent account file. For example, treaty section, reinsurance basis, reinsurer share, and treaty lineage are added to the claim context.',
  },
  {
    id: 'business',
    stage: '8',
    shortTitle: 'Business Check',
    title: 'Business Validation',
    layer: 'Business Rules',
    technology: 'Business rules engine',
    explanation: 'GSRS checks the enriched Silver record against policy, product, benefit, treaty, and claim rules. This confirms whether the claim makes business sense before operations manage the outcome.',
  },
  {
    id: 'manage',
    stage: '9',
    shortTitle: 'Manage',
    title: 'Claim Managed',
    layer: 'Operational GSRS',
    technology: 'Claim management service',
    explanation: 'Operations review the claim, evidence, validations, and treaty context. The claim is routed to either the settled path or the declined path.',
  },
  {
    id: 'outcome',
    stage: '10',
    shortTitle: 'Outcome',
    title: 'Outcome Captured',
    layer: 'Claim Outcome',
    technology: 'Claim decision service',
    explanation: 'GSRS captures the final claim decision. For a settlement, the settlement amount and payment date are written. For a decline, the decline reason and decision evidence are written.',
  },
  {
    id: 'silverOutcome',
    stage: '11',
    shortTitle: 'Silver Update',
    title: 'Final Outcome Stored in Silver',
    layer: 'Silver Delta',
    technology: 'Silver operational Delta table',
    explanation: 'The final outcome is appended back into the Silver lifecycle, preserving the full journey from initial notification to final settlement or decline.',
  },
  {
    id: 'gold',
    stage: '12',
    shortTitle: 'Gold',
    title: 'Curated Data Product Published',
    layer: 'Gold Delta',
    technology: 'Gold curated data product',
    explanation: 'GSRS creates curated data products for reporting, MI, and analytics. Gold is not the main operational history store. Silver remains the source for operational claim history.',
  },
];

function nowIso() {
  return new Date().toISOString();
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function executePipeline(outcome) {
  const snapshots = [];
  let state = {
    sourceFile: deepClone(INITIAL_SOURCE_FILE),
    control: {},
    bronze: null,
    mapping: null,
    canonicalRecords: [],
    technicalValidation: null,
    silver: [],
    enrichment: null,
    businessValidation: null,
    claimManagement: null,
    outcomeRecord: null,
    gold: null,
    exceptions: [],
  };

  const addSnapshot = (stepId, movement) => {
    snapshots.push({ stepId, movement, state: deepClone(state) });
  };

  addSnapshot('upload', {
    incoming: ['AIA_AIO_claim_26M03.csv uploaded through UI'],
    action: ['Capture source channel, uploaded user, timestamp, original rows'],
    validation: ['File exists', 'Cedent is AIA', 'One row detected'],
    written: ['sourceFile object in landing memory'],
    result: 'File received but not transformed.',
  });

  state.control = {
    runId: `RUN-${Date.now()}`,
    fileId: 'FILE-AIA-CLAIM-0001',
    status: 'RECEIVED',
    createdAt: nowIso(),
    sourceFileName: state.sourceFile.fileName,
    reportingPeriod: state.sourceFile.reportingPeriod,
  };
  addSnapshot('register', {
    incoming: ['sourceFile metadata', 'cedent', 'reportingPeriod'],
    action: ['Create run ID', 'Create file ID', 'Set pipeline status to RECEIVED'],
    validation: ['Duplicate run check passed', 'Reporting period is open'],
    written: ['control.runId', 'control.fileId', 'control.status'],
    result: 'The file can now be tracked end-to-end.',
  });

  state.bronze = {
    table: 'bronze_aia_claim_raw',
    rows: state.sourceFile.rows.map((row, index) => ({
      ingestionRunId: state.control.runId,
      sourceFileName: state.sourceFile.fileName,
      rowNumber: index + 1,
      rawPayload: row,
      loadedAt: nowIso(),
    })),
  };
  addSnapshot('bronze', {
    incoming: ['Original AIA row', 'run metadata'],
    action: ['Write raw row to Bronze exactly as received'],
    validation: ['Row count = 1', 'Schema captured', 'Lineage captured'],
    written: ['bronze_aia_claim_raw.rawPayload', 'sourceFileName', 'ingestionRunId'],
    result: 'Bronze now holds the unchanged source data.',
  });

  const raw = state.bronze.rows[0].rawPayload;
  const unmappedFields = Object.keys(raw).filter((field) => !CANONICAL_MAPPING[field]);
  const canonical = Object.entries(raw).reduce((acc, [sourceField, value]) => {
    const targetField = CANONICAL_MAPPING[sourceField];
    if (targetField) acc[targetField] = value;
    return acc;
  }, {});
  canonical.businessKey = `${canonical.policyNumber}|${canonical.productOrgCode}|${canonical.claimNumber}`;
  canonical.sourceToTargetLineage = CANONICAL_MAPPING;

  state.mapping = {
    mappingSet: 'AIA_CLAIM_TO_GSRS_CANONICAL_V1',
    status: unmappedFields.length ? 'MAPPED_WITH_WARNINGS' : 'MAPPED',
    unmappedFields,
  };
  state.canonicalRecords = [canonical];
  addSnapshot('mapping', {
    incoming: ['Bronze rawPayload', 'source-to-target mapping rules', 'GSRS canonical claim model'],
    action: ['Map POLNUM to policyNumber', 'Map CLMNUM to claimNumber', 'Map ORIGNCOD to productOrgCode', 'Create canonical claim record'],
    validation: ['Mandatory mappings found', `Unmapped fields: ${unmappedFields.length || 0}`],
    written: ['canonical_claim_record', 'mapping_status', 'source_to_target_lineage'],
    result: 'A standard GSRS claim shape has been created.',
  });

  const technicalErrors = [];
  const c = state.canonicalRecords[0];
  if (!c.policyNumber) technicalErrors.push('Missing policyNumber');
  if (!c.claimNumber) technicalErrors.push('Missing claimNumber');
  if (!c.productOrgCode) technicalErrors.push('Missing productOrgCode');
  if (Number.isNaN(Number(c.settlementAmount))) technicalErrors.push('settlementAmount is not numeric');
  if (c.paymentDate && !/^\d{4}-\d{2}-\d{2}$/.test(c.paymentDate)) technicalErrors.push('paymentDate is not YYYY-MM-DD');

  state.technicalValidation = {
    status: technicalErrors.length ? 'FAILED' : 'PASSED',
    errors: technicalErrors,
    checkedAt: nowIso(),
  };
  if (technicalErrors.length) {
    state.exceptions.push({ type: 'TECHNICAL', errors: technicalErrors });
  }
  addSnapshot('technical', {
    incoming: ['canonical_claim_record'],
    action: ['Check mandatory fields', 'Check date format', 'Check numeric fields', 'Check structural quality'],
    validation: technicalErrors.length ? technicalErrors : ['All technical checks passed'],
    written: ['technical_validation_result', 'technical_error_code if failed'],
    result: technicalErrors.length ? 'Record blocked by technical exception.' : 'Record can be written to Silver.',
  });

  state.silver = [
    {
      ...c,
      silverTable: 'silver_claim_lifecycle',
      lifecycleStatus: 'NOTIFIED_TO_SETTLEMENT_REVIEW',
      technicalValidationStatus: state.technicalValidation.status,
      history: [
        { period: '2026-01', status: 'NOTIFIED', amount: null, date: '2026-01-12' },
        { period: '2026-02', status: 'UNDER_REVIEW', amount: null, date: '2026-02-15' },
        { period: '2026-03', status: 'SETTLEMENT_REVIEW', amount: c.settlementAmount, date: c.paymentDate },
      ],
      silverUpdatedAt: nowIso(),
    },
  ];
  addSnapshot('silver', {
    incoming: ['technically valid canonical record'],
    action: ['Create business key', 'Append reporting period', 'Preserve prior states', 'Create Silver lifecycle row'],
    validation: ['Business key is unique', 'Previous history retained', 'Lineage retained'],
    written: ['silver_claim_lifecycle', 'full_claim_history', 'technicalValidationStatus'],
    result: 'Silver now contains operational claim history.',
  });

  const silverClaim = state.silver[0];
  const treatyMatch = TREATY_DOCUMENT.productOrgCode === silverClaim.productOrgCode && TREATY_DOCUMENT.benefitCode === silverClaim.benefitCode;
  state.enrichment = {
    status: treatyMatch ? 'ENRICHED' : 'TREATY_NOT_MATCHED',
    treatyDocument: treatyMatch ? TREATY_DOCUMENT.documentId : null,
  };
  if (treatyMatch) {
    state.silver[0] = {
      ...state.silver[0],
      treatyReference: TREATY_DOCUMENT.treatyReference,
      treatySection: TREATY_DOCUMENT.treatySection,
      reinsuranceBasis: TREATY_DOCUMENT.reinsuranceBasis,
      reinsurerSharePct: TREATY_DOCUMENT.reinsurerSharePct,
      recoveryBasis: TREATY_DOCUMENT.recoveryBasis,
      treatyDocumentLineage: TREATY_DOCUMENT.documentId,
      enrichmentStatus: 'ENRICHED',
    };
  } else {
    state.exceptions.push({ type: 'ENRICHMENT', errors: ['Treaty not matched'] });
  }
  addSnapshot('treaty', {
    incoming: ['Silver claim lifecycle record', 'Treaty document data', 'productOrgCode', 'benefitCode'],
    action: ['Match claim to treaty document', 'Add treaty section', 'Add reinsurance basis', 'Create treaty lineage'],
    validation: treatyMatch ? ['Treaty document matched', 'Benefit mapping valid', 'Lineage captured'] : ['Treaty not matched'],
    written: ['treatyReference', 'treatySection', 'reinsuranceBasis', 'treatyDocumentLineage'],
    result: treatyMatch ? 'Silver record has been enriched with treaty context.' : 'Claim sent to enrichment exception queue.',
  });

  const businessErrors = [];
  const enriched = state.silver[0];
  if (!enriched.treatyReference) businessErrors.push('Missing treaty reference');
  if (enriched.settlementAmount > enriched.sumAssured) businessErrors.push('Settlement exceeds sum assured');
  if (enriched.cededAmount > enriched.netAmountAtRisk) businessErrors.push('Ceded amount exceeds NAR');

  state.businessValidation = {
    status: businessErrors.length ? 'FAILED' : 'PASSED',
    errors: businessErrors,
    checkedAt: nowIso(),
  };
  if (businessErrors.length) {
    state.exceptions.push({ type: 'BUSINESS', errors: businessErrors });
  }
  addSnapshot('business', {
    incoming: ['treaty-enriched Silver claim record', 'policy/product/treaty rules'],
    action: ['Check treaty context exists', 'Check claim amount vs sum assured', 'Check ceding amount vs NAR'],
    validation: businessErrors.length ? businessErrors : ['All business checks passed'],
    written: ['business_validation_result', 'business_ready_flag'],
    result: businessErrors.length ? 'Claim requires business review.' : 'Claim can be managed by operations.',
  });

  state.claimManagement = {
    workQueue: 'claim_operations_review',
    assignedTo: 'claims.operations@gsrs.local',
    decisionPending: false,
    route: outcome === 'settled' ? 'SETTLEMENT_PATH' : 'DECLINE_PATH',
    reviewedAt: nowIso(),
  };
  addSnapshot('manage', {
    incoming: ['business-valid Silver record', 'validation evidence', 'treaty context'],
    action: ['Claims operations review record', 'Confirm evidence', 'Route to selected outcome path'],
    validation: ['Decision maker authorised', 'Required evidence present'],
    written: ['claim_decision_route', 'review_notes', 'approval_status'],
    result: `Claim routed to ${outcome === 'settled' ? 'settlement' : 'decline'} path.`,
  });

  state.outcomeRecord =
    outcome === 'settled'
      ? {
          claimStatus: 'SETTLED',
          settlementAmount: enriched.settlementAmount,
          paymentDate: enriched.paymentDate,
          reinsuranceRecovery: enriched.cededAmount,
          approvedBy: 'claims.manager@gsrs.local',
        }
      : {
          claimStatus: 'DECLINED',
          declineReason: 'Not covered under treaty benefit rules',
          decisionDate: nowIso().slice(0, 10),
          reviewedBy: 'claims.manager@gsrs.local',
        };
  addSnapshot('outcome', {
    incoming: ['managed claim record', 'decision evidence'],
    action: outcome === 'settled' ? ['Set claim status to SETTLED', 'Capture payment date', 'Calculate recovery'] : ['Set claim status to DECLINED', 'Capture decline reason', 'Attach review evidence'],
    validation: outcome === 'settled' ? ['Settlement amount exists', 'Payment date exists'] : ['Decline reason exists', 'Reviewer recorded'],
    written: ['claim_outcome_record'],
    result: `Final outcome captured as ${state.outcomeRecord.claimStatus}.`,
  });

  state.silver[0] = {
    ...state.silver[0],
    finalOutcome: state.outcomeRecord,
    currentClaimStatus: state.outcomeRecord.claimStatus,
    history: [
      ...state.silver[0].history,
      { period: '2026-03', status: state.outcomeRecord.claimStatus, amount: state.outcomeRecord.settlementAmount || null, date: state.outcomeRecord.paymentDate || state.outcomeRecord.decisionDate },
    ],
  };
  addSnapshot('silverOutcome', {
    incoming: ['claim outcome record', 'existing Silver lifecycle'],
    action: ['Append final outcome to lifecycle', 'Preserve previous states', 'Make full history visible'],
    validation: ['Lifecycle sequence valid', 'Lineage complete'],
    written: ['silver_claim_lifecycle.finalOutcome', 'currentClaimStatus', 'history[]'],
    result: 'Silver contains the complete operational claim journey.',
  });

  state.gold =
    outcome === 'settled'
      ? {
          table: 'gold_claim_settlement_product',
          measures: {
            paidClaims: 1,
            totalSettlementAmount: enriched.settlementAmount,
            totalReinsuranceRecovery: enriched.cededAmount,
          },
          dimensions: {
            cedent: INITIAL_SOURCE_FILE.cedent,
            productOrgCode: enriched.productOrgCode,
            treatyReference: enriched.treatyReference,
          },
        }
      : {
          table: 'gold_claim_decline_product',
          measures: {
            declinedClaims: 1,
            declineRate: '100% in demo sample',
          },
          dimensions: {
            cedent: INITIAL_SOURCE_FILE.cedent,
            productOrgCode: enriched.productOrgCode,
            declineReason: state.outcomeRecord.declineReason,
          },
        };
  addSnapshot('gold', {
    incoming: ['final Silver claim lifecycle', 'approved metric definitions'],
    action: outcome === 'settled' ? ['Create paid claims measure', 'Create recovery measure', 'Publish settlement data product'] : ['Create declined claims measure', 'Create decline reason analysis', 'Publish decline data product'],
    validation: ['Gold reconciles to Silver', 'Reporting period correct'],
    written: [state.gold.table, 'curated measures', 'reporting dimensions'],
    result: 'Gold data product is ready for MI, dashboards, and analytics.',
  });

  return snapshots;
}

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function recordTableFromObject(object, preferredColumns = []) {
  if (!object) return { columns: [], rows: [] };
  const columns = preferredColumns.length
    ? preferredColumns.filter((column) => Object.prototype.hasOwnProperty.call(object, column))
    : Object.keys(object).filter((key) => typeof object[key] !== 'object');

  return {
    columns,
    rows: [columns.map((column) => formatValue(object[column]))],
  };
}

function buildSelectedDataTables(snapshot) {
  const state = snapshot.state;
  const stepId = snapshot.stepId;

  if (stepId === 'upload') {
    return [
      {
        title: 'AIA source account file row',
        columns: Object.keys(state.sourceFile.rows[0]),
        rows: state.sourceFile.rows.map((row) => Object.keys(state.sourceFile.rows[0]).map((column) => formatValue(row[column]))),
      },
      {
        title: 'Upload metadata captured by GSRS',
        columns: ['fileName', 'channel', 'cedent', 'reportingPeriod', 'uploadedBy'],
        rows: [[state.sourceFile.fileName, state.sourceFile.channel, state.sourceFile.cedent, state.sourceFile.reportingPeriod, state.sourceFile.uploadedBy]],
      },
    ];
  }

  if (stepId === 'register') {
    return [
      {
        title: 'Ingestion control table',
        ...recordTableFromObject(state.control, ['runId', 'fileId', 'status', 'createdAt', 'sourceFileName', 'reportingPeriod']),
      },
    ];
  }

  if (stepId === 'bronze') {
    return [
      {
        title: 'Bronze raw landing table',
        columns: ['ingestionRunId', 'sourceFileName', 'rowNumber', 'POLNUM', 'CLMNUM', 'ORIGNCOD', 'CLAIM_STATUS', 'STLAMT', 'PAYDTE'],
        rows: state.bronze.rows.map((row) => [
          row.ingestionRunId,
          row.sourceFileName,
          row.rowNumber,
          row.rawPayload.POLNUM,
          row.rawPayload.CLMNUM,
          row.rawPayload.ORIGNCOD,
          row.rawPayload.CLAIM_STATUS,
          formatValue(row.rawPayload.STLAMT),
          row.rawPayload.PAYDTE,
        ]),
      },
    ];
  }

  if (stepId === 'mapping') {
    const raw = state.bronze.rows[0].rawPayload;
    const canonical = state.canonicalRecords[0] || {};
    return [
      {
        title: 'Source-to-target mapping applied',
        columns: ['Source field', 'Target canonical field', 'Source value', 'Mapped value'],
        rows: Object.entries(CANONICAL_MAPPING).map(([sourceField, targetField]) => [
          sourceField,
          targetField,
          formatValue(raw[sourceField]),
          formatValue(canonical[targetField]),
        ]),
      },
      {
        title: 'Canonical claim record created',
        columns: ['businessKey', 'policyNumber', 'claimNumber', 'productOrgCode', 'settlementAmount', 'paymentDate', 'benefitCode'],
        rows: [[
          canonical.businessKey,
          canonical.policyNumber,
          canonical.claimNumber,
          canonical.productOrgCode,
          formatValue(canonical.settlementAmount),
          canonical.paymentDate,
          canonical.benefitCode,
        ]],
      },
    ];
  }

  if (stepId === 'technical') {
    const checks = [
      ['policyNumber', 'Mandatory field present', state.canonicalRecords[0]?.policyNumber ? 'PASS' : 'FAIL'],
      ['claimNumber', 'Mandatory field present', state.canonicalRecords[0]?.claimNumber ? 'PASS' : 'FAIL'],
      ['productOrgCode', 'Mandatory field present', state.canonicalRecords[0]?.productOrgCode ? 'PASS' : 'FAIL'],
      ['settlementAmount', 'Numeric value', !Number.isNaN(Number(state.canonicalRecords[0]?.settlementAmount)) ? 'PASS' : 'FAIL'],
      ['paymentDate', 'YYYY-MM-DD date format', /^\d{4}-\d{2}-\d{2}$/.test(state.canonicalRecords[0]?.paymentDate || '') ? 'PASS' : 'FAIL'],
    ];
    return [
      {
        title: 'Technical validation result table',
        columns: ['Field', 'Check', 'Result'],
        rows: checks,
      },
      {
        title: 'Technical validation status',
        columns: ['Status', 'Checked at', 'Errors'],
        rows: [[state.technicalValidation.status, state.technicalValidation.checkedAt, state.technicalValidation.errors.join('; ') || 'None']],
      },
    ];
  }

  if (stepId === 'silver') {
    const silver = state.silver[0];
    return [
      {
        title: 'Silver operational claim record',
        columns: ['businessKey', 'policyNumber', 'claimNumber', 'productOrgCode', 'lifecycleStatus', 'technicalValidationStatus'],
        rows: [[silver.businessKey, silver.policyNumber, silver.claimNumber, silver.productOrgCode, silver.lifecycleStatus, silver.technicalValidationStatus]],
      },
      {
        title: 'Silver cumulative claim history',
        columns: ['period', 'status', 'amount', 'date'],
        rows: silver.history.map((item) => [item.period, item.status, formatValue(item.amount), item.date]),
      },
    ];
  }

  if (stepId === 'treaty') {
    const silver = state.silver[0];
    return [
      {
        title: 'Treaty enrichment added to Silver claim',
        columns: ['treatyReference', 'treatySection', 'reinsuranceBasis', 'reinsurerSharePct', 'recoveryBasis', 'lineage'],
        rows: [[silver.treatyReference, silver.treatySection, silver.reinsuranceBasis, formatValue(silver.reinsurerSharePct), silver.recoveryBasis, silver.treatyDocumentLineage]],
      },
      {
        title: 'Enrichment status',
        columns: ['status', 'treatyDocument'],
        rows: [[state.enrichment.status, state.enrichment.treatyDocument || 'Not matched']],
      },
    ];
  }

  if (stepId === 'business') {
    const enriched = state.silver[0];
    return [
      {
        title: 'Business validation checks',
        columns: ['Rule', 'Input value', 'Result'],
        rows: [
          ['Treaty reference exists', enriched.treatyReference || '', enriched.treatyReference ? 'PASS' : 'FAIL'],
          ['Settlement amount <= sum assured', `${enriched.settlementAmount} <= ${enriched.sumAssured}`, enriched.settlementAmount <= enriched.sumAssured ? 'PASS' : 'FAIL'],
          ['Ceded amount <= net amount at risk', `${enriched.cededAmount} <= ${enriched.netAmountAtRisk}`, enriched.cededAmount <= enriched.netAmountAtRisk ? 'PASS' : 'FAIL'],
        ],
      },
      {
        title: 'Business validation status',
        columns: ['Status', 'Checked at', 'Errors'],
        rows: [[state.businessValidation.status, state.businessValidation.checkedAt, state.businessValidation.errors.join('; ') || 'None']],
      },
    ];
  }

  if (stepId === 'manage') {
    return [
      {
        title: 'Claim management work queue',
        columns: ['workQueue', 'assignedTo', 'route', 'decisionPending', 'reviewedAt'],
        rows: [[state.claimManagement.workQueue, state.claimManagement.assignedTo, state.claimManagement.route, formatValue(state.claimManagement.decisionPending), state.claimManagement.reviewedAt]],
      },
    ];
  }

  if (stepId === 'outcome') {
    return [
      {
        title: 'Claim outcome record',
        columns: Object.keys(state.outcomeRecord),
        rows: [Object.keys(state.outcomeRecord).map((column) => formatValue(state.outcomeRecord[column]))],
      },
    ];
  }

  if (stepId === 'silverOutcome') {
    const silver = state.silver[0];
    return [
      {
        title: 'Final Silver lifecycle history',
        columns: ['period', 'status', 'amount', 'date'],
        rows: silver.history.map((item) => [item.period, item.status, formatValue(item.amount), item.date]),
      },
      {
        title: 'Current Silver claim status',
        columns: ['businessKey', 'currentClaimStatus', 'finalOutcome'],
        rows: [[silver.businessKey, silver.currentClaimStatus, silver.finalOutcome.claimStatus]],
      },
    ];
  }

  if (stepId === 'gold') {
    return [
      {
        title: 'Gold curated data product',
        columns: ['table', 'measure / dimension', 'value'],
        rows: [
          [state.gold.table, 'product type', state.gold.table],
          ...Object.entries(state.gold.measures).map(([key, value]) => [state.gold.table, key, formatValue(value)]),
          ...Object.entries(state.gold.dimensions).map(([key, value]) => [state.gold.table, key, formatValue(value)]),
        ],
      },
    ];
  }

  return [
    {
      title: 'Backend data after selected step',
      columns: ['Area', 'Value'],
      rows: [['No table available', '']],
    },
  ];
}

function DataPreviewTable({ table }) {
  return (
    <div className="data-preview-section">
      <div className="data-preview-title">{table.title}</div>
      <div className="data-preview-scroll">
        <table className="data-preview-table">
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DataTablesPanel({ snapshot }) {
  const tables = buildSelectedDataTables(snapshot);
  return (
    <div className="data-tables-panel">
      <div className="data-tables-header">
        <span>Actual backend data after this step</span>
        <strong>{snapshot.movement.result}</strong>
      </div>
      <div className="data-tables-grid">
        {tables.map((table) => (
          <DataPreviewTable key={table.title} table={table} />
        ))}
      </div>
    </div>
  );
}

function MiniList({ title, items, tone }) {
  return (
    <div className={`mini-list ${tone}`}>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function DataMovementTable({ snapshots }) {
  return (
    <div className="table-wrap">
      <table className="movement-table">
        <thead>
          <tr>
            <th>Stage</th>
            <th>Backend movement</th>
            <th>Data written / changed</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((snapshot, index) => (
            <tr key={snapshot.stepId}>
              <td>{index + 1}. {snapshot.stepId}</td>
              <td>{snapshot.movement.action.join('; ')}</td>
              <td>{snapshot.movement.written.join(', ')}</td>
              <td>{snapshot.movement.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const [outcome, setOutcome] = useState('settled');
  const [selectedStepId, setSelectedStepId] = useState('upload');

  const snapshots = useMemo(() => executePipeline(outcome), [outcome]);
  const selectedStep = PIPELINE_STEPS.find((step) => step.id === selectedStepId) || PIPELINE_STEPS[0];
  const selectedSnapshot = snapshots.find((item) => item.stepId === selectedStepId) || snapshots[0];

  return (
    <div className="app">
      <aside className="left-nav">
        <div className="brand">
          <span>GSRS / AIA Claims</span>
          <h1>Live Data Flow</h1>
          <p>Simulated backend movement with actual data transformations.</p>
        </div>

        <div className="route-toggle">
          <button className={outcome === 'settled' ? 'active settled' : ''} onClick={() => setOutcome('settled')}>Settled route</button>
          <button className={outcome === 'declined' ? 'active declined' : ''} onClick={() => setOutcome('declined')}>Declined route</button>
        </div>

        <nav className="stage-nav">
          {PIPELINE_STEPS.map((step) => (
            <button key={step.id} className={selectedStepId === step.id ? 'active' : ''} onClick={() => setSelectedStepId(step.id)}>
              <span>{step.stage}</span>
              <div>
                <strong>{step.shortTitle}</strong>
                <small>{step.layer}</small>
              </div>
            </button>
          ))}
        </nav>
      </aside>

      <main className="right-content">
        <section className="top-detail">
          <div className="panel-title">
            <div>
              <span>Selected backend step</span>
              <h2>{selectedStep.stage}. {selectedStep.title}</h2>
            </div>
            <div className={`status-chip ${outcome}`}>{outcome === 'settled' ? 'Settlement path' : 'Decline path'}</div>
          </div>

          <div className="step-summary">
            <div><span>Technology</span><strong>{selectedStep.technology}</strong></div>
            <div><span>Layer</span><strong>{selectedStep.layer}</strong></div>
            <div><span>What happens</span><strong>{selectedStep.explanation}</strong></div>
          </div>

          <div className="movement-grid">
            <MiniList title="Data coming in" items={selectedSnapshot.movement.incoming} tone="incoming" />
            <MiniList title="Backend action" items={selectedSnapshot.movement.action} tone="action" />
            <MiniList title="Validation checks" items={selectedSnapshot.movement.validation} tone="validation" />
            <MiniList title="Data written / changed" items={selectedSnapshot.movement.written} tone="written" />
          </div>
        </section>

        <section className="data-panel">
          <DataTablesPanel snapshot={selectedSnapshot} />
        </section>

        <section className="bottom-table">
          <div className="panel-title table-title">
            <div>
              <span>End-to-end view</span>
              <h2>Backend movement table</h2>
            </div>
            <div className="neutral-chip">Silver for operations / Gold for curated products</div>
          </div>
          <DataMovementTable snapshots={snapshots} />
        </section>
      </main>
    </div>
  );
}

export default App;
