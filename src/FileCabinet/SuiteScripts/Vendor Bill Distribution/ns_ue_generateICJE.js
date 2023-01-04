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
 * @NScriptType UserEventScript
 */
define(['N/runtime', 'N/search', 'N/record', 'N/task'],
  (NS_runtime, NS_search, NS_record, NS_task) => {
    const afterSubmit = (scriptContext) => {
      try {
        const PARAMS = getParameters();
        let recordType = scriptContext.newRecord.type;
        log.debug({title: 'Record Type', details: recordType});
        if (recordType === 'vendorbill') {
          let vbID = scriptContext.newRecord.id;

          if (validateContextType(scriptContext) || NS_runtime.executionContext == NS_runtime.ContextType.MAP_REDUCE) {
            return;
          }

          let vbLoad = NS_record.load({
            type: NS_record.Type.VENDOR_BILL,
            id: vbID
          });
          let linkedJE = vbLoad.getValue({fieldId: 'custbody_ns_vb_linked_icje'});
          let expenseLineCount = vbLoad.getLineCount({sublistId: 'expense'});
          let createICJE = false;

          for (let i = 0; i < expenseLineCount; i++) {
            let destinationSubsidiary = vbLoad.getSublistValue({
              sublistId: 'expense',
              fieldId: 'custcol_ns_destination_subsidiary',
              line: i
            });
            if (!isEmpty(destinationSubsidiary)) {
              createICJE = true;
              break;
            }
          }

          if (createICJE && isEmpty(linkedJE) || scriptContext.type === scriptContext.UserEventType.EDIT) {
            log.debug({title: 'Trigger MR Script', details: 'Create ICJE and link to VB'});
            let mrTask = NS_task.create({
              taskType: NS_task.TaskType.MAP_REDUCE,
              scriptId: PARAMS.mrScriptID,
              params: {custscript_ns_mr_vb_id: vbID}
            });
            let mrTaskID = mrTask.submit();
            if (!mrTaskID) {
              log.error({title: 'MR Task Error', details: 'Unable to execute Map/Reduce Script for ICJE creation'});
            } else {
              log.debug({title: 'MR Task Successfully Executed', details: mrTaskID});
            }
          }
        }
      } catch (error) {
        log.error({title: "afterSubmit error", details: error.toString()});
      }
    }

    /**
     * Uses Runtime Module to get Parameters from Script Record
     * @returns {object}
     */
    const getParameters = () => {
      try {
        const currentScript = NS_runtime.getCurrentScript();
        let parameters = {};
        parameters.mrScriptID = currentScript.getParameter({name: 'custscript_ns_mr_script_id'});
        return parameters;
      } catch (error) {
        log.error({title: 'getParameters error', details: error.toString()});
      }
    }

    /**
     * Validates Context Type.
     * When calling this function, use code similar to... if (!validateContextType(scriptContext)){return;}
     * @param scriptContext
     * @returns {boolean}
     */
    const validateContextType = (scriptContext) => {
      let validContextTypes = [
        scriptContext.UserEventType.CREATE,
        scriptContext.UserEventType.EDIT,
      ];

      log.debug({
        title: 'validateContextType',
        details: {
          contextType: scriptContext.type,
          validContextTypes: validContextTypes
        }
      });
      return validContextTypes.indexOf(scriptContext.type) !== -1;
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
            for (var k in v) {return false;}
            return true;
          })(stValue)));
    }

    return {afterSubmit}
  });
