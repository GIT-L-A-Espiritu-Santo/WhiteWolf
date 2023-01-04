/**
 * Copyright (c) 1998-2022 Oracle NetSuite, Inc.
 *  500 Oracle Parkway Redwood Shores, CA 94065 United States 650-627-1000
 *  All Rights Reserved.
 *
 *  This software is the confidential and proprietary information of
 *  NetSuite, Inc. ('Confidential Information'). You shall not
 *  disclose such Confidential Information and shall use it only in
 *  accordance with the terms of the license agreement you entered into
 *  with Oracle NetSuite.
 *
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/record', 'N/search', 'N/format', 'N/config', 'N/runtime', 'N/error'],
  (NS_record, NS_search, NS_format, NS_config, NS_runtime, NS_error) => {
    const getInputData = (inputContext) => {
      try {
        const PARAMS = getParameters();
        return NS_search.create({
          type: NS_search.Type.VENDOR_BILL,
          filters: [
            ['mainline', 'is', 'F'],
            'AND',
            ['cogs', 'is', 'F'],
            'AND',
            ['taxline', 'is', 'F'],
            'AND',
            ['shipping', 'is', 'F'],
            'AND',
            ['internalidnumber', 'equalto', PARAMS.vendorBillID]
          ],
          columns: [
            'custcol_ns_destination_subsidiary',
            'custcol_ns_interco_entity_used',
            'account',
            'custcol_ns_destination_department',
            'memo',
            'subsidiary',
            'total',
            'line',
            'mainname',
            'trandate',
            'postingperiod',
            'custbody_ns_vb_linked_icje',
            'department',
          ]
        });
      } catch (error) {
        log.error({title: "getInputData error", details: error.toString()});
      }
    }

    const reduce = (reduceContext) => {
      const PARAMS = getParameters();
      let contextResults = reduceContext.values;
      log.debug({title: 'Context Results', details: contextResults});

      let firstResult = JSON.parse(contextResults[0]).values;
      let linkedICJE = firstResult.custbody_ns_vb_linked_icje.value;
      if (linkedICJE) {reverseICJE(linkedICJE)}

      let newICJE = NS_record.create({
        type: NS_record.Type.ADV_INTER_COMPANY_JOURNAL_ENTRY,
        isDynamic: true
      });

      setHeaderValues(firstResult, newICJE);
      setLines(contextResults, newICJE);

      newICJE.setValue({
        fieldId: 'custbody_ns_linked_bill',
        value: PARAMS.vendorBillID
      });
      let newICJEID = newICJE.save();
      log.audit({title: 'New ICJE ' + newICJEID + ' created', details: 'From Bill ' + PARAMS.vendorBillID});

      NS_record.submitFields({
        type: NS_record.Type.VENDOR_BILL,
        id: PARAMS.vendorBillID,
        values: {
          'custbody_ns_vb_linked_icje': newICJEID,
          'custbody_ns_ic_error': ''
        },
        options: {
          enableSourcing: false,
          ignoreMandatoryFields: true
        }
      });
    }

    const summarize = (summaryContext) => {
      let type = summaryContext.toString();
      log.audit({
        title: 'Summary ' + type,
        details: 'Usage Consumed: ' + summaryContext.usage + ' | Number of Queues: ' + summaryContext.concurrency + ' | Number of Yields: ' + summaryContext.yields
      });

      summaryContext.output.iterator().each(function (key, value) {
        log.audit({title: 'Summary Output[' + key + ']', details: JSON.stringify(value)});
        return true;
      });

      logErrorIfAny(summaryContext);
    }

    /**
     * Log Errors if they exist
     * @param summaryContext
     */
    const logErrorIfAny = (summaryContext) => {
      let inputSummary = summaryContext.inputSummary;
      let mapSummary = summaryContext.mapSummary;
      let reduceSummary = summaryContext.reduceSummary;

      if (inputSummary.error) {
        let e = NS_error.create({
          name: 'Error on Get Input Data',
          message: inputSummary.error
        });
        log.error({title: 'Input Data', details: e.message});
      }
      handleErrorInStage('map', mapSummary);
      handleErrorInStage('reduce', reduceSummary);
    }

    /**
     * Handles Errors in each stage
     * @param stage
     * @param summary
     */
    const handleErrorInStage = (stage, summary) =>{
      let errorMsg = [];
      summary.errors.iterator().each(function (key, value) {
        let msg = 'Failure to create ICJE: ' + key + '. Error was:' + JSON.parse(value).message;
        updateErrorField(key, JSON.parse(value).message);
        errorMsg.push(msg);
        return true;
      });
      if (errorMsg.length > 0) {
        log.error({title: stage, details: JSON.stringify(errorMsg)});
      }
    }

    /**
     * Updates Vendor Bill with an error message if it exists
     * @param vbID
     * @param errorMessage
     */
    const updateErrorField = (vbID, errorMessage) =>{
      NS_record.submitFields({
        type: NS_record.Type.VENDOR_BILL,
        id: vbID,
        values: {
          custbody_ns_ic_error: errorMessage
        },
        options: {
          enableSourcing: false,
          ignoreMandatoryFields: true
        }
      });
    }

    /**
     * Uses Runtime Module to get Parameters from Script Record
     * @returns {object}
     */
    const getParameters = () => {
      const currentScript = NS_runtime.getCurrentScript();
      let parameters = {};
      parameters.vendorBillID = currentScript.getParameter({name: 'custscript_ns_mr_vb_id'});
      return parameters;
    }

    /**
     * Reverses an existing Intercompany Journal Entry
     * @param linkedICJE
     */
    const reverseICJE = (linkedICJE) => {
      log.debug({title: 'Reverse ICJE Function', details: 'Reversing ICJE ' + linkedICJE});
      let ICJELoad = NS_record.load({
        type: NS_record.Type.ADV_INTER_COMPANY_JOURNAL_ENTRY,
        id: linkedICJE
      });
      let tranDate = ICJELoad.getValue({fieldId: 'trandate'});
      ICJELoad.setValue({fieldId: 'reversaldate', value: tranDate, ignoreFieldChange: true});
      ICJELoad.save();
    }

    /**
     * Sets Header Field values to the new Intercompany Journal Entry
     * @param firstResult
     * @param newICJE
     */
    const setHeaderValues = (firstResult, newICJE) => {
      let subsidiary = firstResult.subsidiary.value;
      let memo = firstResult.memo;
      let postingPeriod = firstResult.postingperiod.value;
      let tranDate = firstResult.trandate;

      log.debug({title: 'Header Subsidiary', details: subsidiary});

      newICJE.setValue({fieldId: 'subsidiary', value: subsidiary});
      newICJE.setValue({fieldId: 'memo', value: memo});
      newICJE.setValue({fieldId: 'trandate', value: NS_format.parse({type: NS_format.Type.DATE, value: tranDate})});

      let openPeriod = getPostingPeriod(postingPeriod);
      if (!isEmpty(openPeriod)) {
        newICJE.setValue({
          fieldId: 'postingperiod',
          value: openPeriod
        });
      }
    }

    /**
     * Validate if provided Posting Period is open
     * @param postingPeriod
     * @returns {string}
     */
    const getPostingPeriod = (postingPeriod) => {
      let openPeriods = [];
      let returnPeriod = '';
      let periodSearch = NS_search.create({
        type: NS_search.Type.ACCOUNTING_PERIOD,
        filters: [
          ['isquarter', 'is', 'F'],
          'AND',
          ['isyear', 'is', 'F']
        ],
        columns: [
          NS_search.createColumn({
            name: 'internalid',
            sort: NS_search.Sort.ASC
          }),
          'periodname',
          'closed'
        ]
      }).run();

      periodSearch.each(function (result) {
        let isClosed = result.getValue('closed');
        let periodID = result.getValue('internalid');

        if (!isClosed) {
          openPeriods.push(periodID);
        }
        return true;
      });

      if (openPeriods.indexOf(postingPeriod) >= 0 && openPeriods && openPeriods.length > 0) {
        returnPeriod = openPeriods[0];
      }

      return returnPeriod;
    }

    /**
     * Checks if parameter is empty.
     * @param stValue
     * @returns {boolean}
     */
    const isEmpty = (stValue) => {
      return (
        (stValue === '' || stValue == null || false) ||
        (stValue.constructor === Array && stValue.length === 0) ||
        (stValue.constructor === Object &&
          (function (v) {
            for (let k in v) {return false;}
            return true;
          })(stValue)));
    }

    /**
     * Sets Line Items to Intercompany Journal Entry
     * @param contextResults
     * @param newICJE
     */
    const setLines = (contextResults, newICJE) => {
      let configLoad = NS_config.load({type: NS_config.Type.ACCOUNTING_PREFERENCES});
      let accountFrom = configLoad.getValue({fieldId: 'DEFAULT_ICJE_AUTOBAL_RECACCT'});
      let accountTo = configLoad.getValue({fieldId: 'DEFAULT_ICJE_AUTOBAL_PAYACCT'});
      let payableIntercoEntity = getIntercoEntity(contextResults);

      for (let i = 0; i < contextResults.length; i++) {
        let resultValues = JSON.parse(contextResults[i]).values;
        let subsidiary = resultValues.subsidiary.value;
        let destinationSubsidiary = resultValues.custcol_ns_destination_subsidiary.value;

        if (isEmpty(destinationSubsidiary)) {
          log.error({title: 'Destination Subsidiary Missing', details: 'Skipping line ' + contextResults.line});
          continue;
        } else if (subsidiary == destinationSubsidiary) {
          log.error({title: 'Header Subsidiary matches the Destination Subsidiary', details: 'Skipping line ' + contextResults.line});
          continue;
        }

        setLineFrom(newICJE, resultValues, accountFrom);
        setLineTo(newICJE, resultValues, accountTo, payableIntercoEntity);
      }
    }

    /**
     * Searches for the Subsidiary's Interco Entity
     * @param contextResults
     * @returns {*}
     */
    const getIntercoEntity = (contextResults) => {
      let subsidiary;

      for (let i = 0; i < contextResults.length; i++) {
        let result = JSON.parse(contextResults[i]);
        subsidiary = result.values.subsidiary.value;

        if (!isEmpty(subsidiary)) {break;}
      }
      log.debug({title: 'Subsidiary', details: subsidiary});

      let payableIntercoEntity = '';
      if (!isEmpty(subsidiary)) {
        let subsidiaryLookup = NS_search.lookupFields({
          type: NS_record.Type.SUBSIDIARY,
          id: subsidiary,
          columns: ['custrecord_ns_interco_entity']
        });
        payableIntercoEntity = subsidiaryLookup.custrecord_ns_interco_entity[0].value;
      }

      log.debug({title: 'Payable Interco Entity', details: payableIntercoEntity});
      return payableIntercoEntity;
    }

    /**
     * Adds From lines to the Intercompany Journal Entry
     * @param newICJE
     * @param resultValues
     * @param accountFrom
     */
    const setLineFrom = (newICJE, resultValues, accountFrom) => {
      let subsidiary = resultValues.subsidiary.value;
      let destinationSubsidiary = resultValues.custcol_ns_destination_subsidiary.value;
      let intercoEntity = resultValues.custcol_ns_interco_entity_used.value;
      let account = resultValues.account.value;
      let department = resultValues.department.value;
      let location = resultValues["internalid.location"].value;
      let memo = resultValues.memo;
      let fxAmount = Math.abs(resultValues.total);
      let entity = resultValues.mainname.value;

      log.debug({title: 'Line From Credit', details:
        {
          subsidiary: subsidiary,
          linesubsidiary: subsidiary,
          account: account,
          department: department,
          // location: location,
          debit: fxAmount,
          memo: memo,
          entity: entity
        }
      });

      // Credit
      newICJE.selectNewLine({
        sublistId: 'line'
      });

      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'subsidiary',
        value: subsidiary
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'linesubsidiary',
        value: subsidiary
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: account
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'department',
        value: department
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'location',
        value: location
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'credit',
        value: fxAmount
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'memo',
        value: memo
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'entity',
        value: entity
      });
      log.debug({title: 'Due To/From Sub', details: newICJE.getCurrentSublistValue({sublistId: 'line', fieldId: 'duetofromsubsidiary'})});

      newICJE.commitLine({
        sublistId: 'line'
      });

      log.debug({title: 'Line From Debit', details:
        {
          subsidiary: subsidiary,
          linesubsidiary: subsidiary,
          account: accountFrom,
          department: department,
          location: location,
          debit: fxAmount,
          memo: memo,
          entity: intercoEntity
        }
      });

      // Debit
      newICJE.selectNewLine({
        sublistId: 'line'
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'subsidiary',
        value: subsidiary
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'linesubsidiary',
        value: subsidiary
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: accountFrom
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'debit',
        value: fxAmount
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'entity',
        value: intercoEntity
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'location',
        value: location
      });
      log.debug({title: 'Due To/From Sub', details: newICJE.getCurrentSublistValue({sublistId: 'line', fieldId: 'duetofromsubsidiary'})});

      newICJE.commitLine({
        sublistId: 'line'
      });
    }

    /**
     * Adds To lines to the Intercompany Journal Entry
     * @param newICJE
     * @param resultValues
     * @param accountTo
     * @param payableIntercoEntity
     */
    const setLineTo = (newICJE, resultValues, accountTo, payableIntercoEntity) => {
      let destinationSubsidiary = resultValues.custcol_ns_destination_subsidiary.value;
      let account = resultValues.account.value;
      let destinationDepartment = resultValues.custcol_ns_destination_department.value;
      let destinationLocation = resultValues.custcol_ns_destination_location.value;
      let memo = resultValues.memo;
      let fxAmount = Math.abs(resultValues.total);
      let entity = resultValues.mainname.value;
      log.debug({title: 'Line To Debit', details:
        {
          subsidiary: destinationSubsidiary,
          linesubsidiary: destinationSubsidiary,
          account: account,
          department: destinationDepartment,
          location: destinationLocation,
          debit: fxAmount,
          memo: memo,
          entity: entity
        }
      });

      // Debit
      newICJE.selectNewLine({
        sublistId: 'line'
      });

      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'subsidiary',
        value: destinationSubsidiary
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'linesubsidiary',
        value: destinationSubsidiary
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: account
      });
      if (destinationDepartment) {
        newICJE.setCurrentSublistValue({
          sublistId: 'line',
          fieldId: 'department',
          value: destinationDepartment
        });
      }

      if (destinationLocation) {
        newICJE.setCurrentSublistValue({
          sublistId: 'line',
          fieldId: 'location',
          value: destinationLocation
        });
      }

      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'debit',
        value: fxAmount
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'memo',
        value: memo
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'entity',
        value: entity
      });
      log.debug({title: 'Due To/From Sub', details: newICJE.getCurrentSublistValue({sublistId: 'line', fieldId: 'duetofromsubsidiary'})});

      newICJE.commitLine({
        sublistId: 'line'
      });

      log.debug({title: 'Line To Credit', details:
        {
          subsidiary: destinationSubsidiary,
          linesubsidiary: destinationSubsidiary,
          account: accountTo,
          department: destinationDepartment,
          location: destinationLocation,
          debit: fxAmount,
          memo: memo,
          entity: payableIntercoEntity
        }
      });

      // Credit
      newICJE.selectNewLine({
        sublistId: 'line'
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'subsidiary',
        value: destinationSubsidiary
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'linesubsidiary',
        value: destinationSubsidiary
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: accountTo
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'credit',
        value: fxAmount
      });
      newICJE.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'entity',
        value: payableIntercoEntity
      });

      if (destinationLocation) {
        newICJE.setCurrentSublistValue({
          sublistId: 'line',
          fieldId: 'location',
          value: destinationLocation
        });
      }

      log.debug({title: 'Due To/From Sub', details: newICJE.getCurrentSublistValue({sublistId: 'line', fieldId: 'duetofromsubsidiary'})});

      newICJE.commitLine({
        sublistId: 'line'
      });
    }

    return {getInputData, reduce, summarize}
  });
