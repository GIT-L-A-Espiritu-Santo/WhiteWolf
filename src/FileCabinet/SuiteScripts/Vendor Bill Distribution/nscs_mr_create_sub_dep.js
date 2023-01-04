/**
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 */

 define(['N/search', 'N/record', 'N/runtime'], function (search, record, runtime) {

    function getInputData() {
        var currentScript = runtime.getCurrentScript()
        var updateAll = currentScript.getParameter('custscript_nscs_update_all_departments')
        var departmentID = currentScript.getParameter('custscript_nscs_department_id')
        log.debug('Update All', updateAll)
        log.debug('Department ID', departmentID)
        // departmentID = '5'
        var filters
        if (updateAll == 'true') {
            filters = []
        }
        else if (updateAll == 'false') {
            filters = [["internalid", "anyof", departmentID]]
        }

        return search.create({
            type: "department",
            filters: filters,
            columns:
                [
                    search.createColumn({
                        name: "name",
                        sort: search.Sort.ASC,
                        label: "Name"
                    })
                ]
        })
    }

    function map(context) {
        log.debug('Map', context)
        var value = JSON.parse(context.value)
        log.debug('Parsed Values', value)
        log.debug('Department Name', value.values.name)

        var departmentRecord = record.load({
            type: record.Type.DEPARTMENT,
            id: context.key
        })
        var subsidiaryIDs = departmentRecord.getValue({
            fieldId: 'subsidiary'
        })
        log.debug('Selected Subsidiaries', subsidiaryIDs)
        var includeChildren = departmentRecord.getValue({
            fieldId: 'includechildren'
        })
        log.debug('Include Children', includeChildren)


        if (includeChildren) {
            var subsidiaryParentSearch = search.create({
                type: "subsidiary",
                filters: [["isinactive", "is", "F"]],
                columns:
                    [
                        search.createColumn({
                            name: "name",
                            sort: search.Sort.ASC,
                            label: "Name"
                        }),
                        search.createColumn({ name: "parent", label: "Parent Subsidiary" })
                    ]
            })
            var subsidiaryParents = []
            subsidiaryParentSearch.run().each(function (result) {
                // log.debug('Result', result)
                var parsedResult = JSON.parse(JSON.stringify(result))
                subsidiaryParents.push({
                    'Subsidiary': parsedResult.id,
                    'Child': parsedResult.values.parent
                })
                return true
            })
            log.debug('Subsidiary Parents', subsidiaryParents)

            var sizeOfSubsidiariesList = 0
            var sizeCompare = 1
            while (sizeOfSubsidiariesList != sizeCompare) {
                sizeOfSubsidiariesList = subsidiaryIDs.length
                subsidiaryIDs.forEach(function (subsidiaryID) {
                    // log.debug('Searching for children of Subsidiray', subsidiaryID)
                    subsidiaryParents.forEach(function (parent) {
                        // log.debug('Parent', parent)
                        if (parent.Child == subsidiaryID) {
                            if (subsidiaryIDs.indexOf(parent.Subsidiary) == -1) {
                                subsidiaryIDs.push(parent.Subsidiary)
                            }
                        }
                    })
                })
                sizeCompare = subsidiaryIDs.length
            }
        }
        log.debug('Sub List', subsidiaryIDs)

        var recordToCreate = []
        subsidiaryIDs.forEach(function (sub) {
            recordToCreate.push({
                key: context.key,
                value: {
                    'department': value.values.name,
                    'subID': sub,
                    'createRecord': true
                }
            })
        })

        log.debug('Records to Create', recordToCreate)

        var customSubsidiaryDepartmentRecordSearch = search.create({
            type: "customrecord_ns_vendorsub_dept",
            filters: ["custrecord_ns_subdep_department.internalid", "anyof", context.key],
            columns:
                [
                    search.createColumn({ name: "custrecord_ns_subdept_subsidiary", label: "Subsidiary" }),
                    search.createColumn({ name: "custrecord_ns_subdep_department", label: "Department" }),
                ]
        })

        customSubsidiaryDepartmentRecordSearch.run().each(function (result) {
            // log.debug('Result', result)
            var parsedResult = JSON.parse(JSON.stringify(result))
            recordToCreate.forEach(function (record) {
                if (parsedResult.values.custrecord_ns_subdept_subsidiary[0].value == record.value.subID) {
                    record.value.createRecord = false
                }
            })
            return true
        })
        log.debug('Records to Create', recordToCreate)
        recordToCreate.forEach(function (record) {
            context.write(record)
        })
    }

    function reduce(context) {

        log.debug('Reduce', context)
        // var values = JSON.parse(context.values)
        // log.debug('Parsed Values', context.values)

        var departmentID = context.key
        log.debug('Location ID', departmentID)

        var numberOfSubsidiaries = context.values.length
        log.debug('Number of Subsidiaries', numberOfSubsidiaries)
        var numberOfRecordsCreated = 0
        context.values.forEach(function (object) {
            var values = JSON.parse(object)
            log.debug('Values', values)

            if (values.createRecord == true) {
                try {
                    var subsidiaryDepartmentRecord = record.create({
                        type: 'customrecord_ns_vendorsub_dept'
                    })
                    subsidiaryDepartmentRecord.setText({
                        fieldId: 'name',
                        text: values.department,
                        ignoreFieldChange: true
                    })
                    subsidiaryDepartmentRecord.setValue({
                        fieldId: 'custrecord_ns_subdept_subsidiary',
                        value: values.subID,
                        ignoreFieldChange: true
                    })
                    subsidiaryDepartmentRecord.setValue({
                        fieldId: 'custrecord_ns_subdep_department',
                        value: departmentID,
                        ignoreFieldChange: true
                    })
                    log.debug('Vendor Sub Record', subsidiaryDepartmentRecord)

                    var recordID = subsidiaryDepartmentRecord.save()
                    log.debug('Created Vendor Subsidiary Record', 'ID: ' + recordID)
                    numberOfRecordsCreated += 1
                }
                catch (e) { log.debug('Error', e) }
            }
        })
        if (numberOfRecordsCreated > 0) {
            log.debug('Number of Records Created', numberOfRecordsCreated)
        }
        context.write({
            key: context.key,
            value: numberOfRecordsCreated
        })
    }

    // The summarize stage is a serial stage, so this function is invoked only one
    // time.
    function summarize(context) {
        log.debug('Summarize', JSON.stringify(context))
    }

    // Link each entry point to the appropriate function.
    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});