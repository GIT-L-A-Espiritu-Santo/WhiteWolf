/**
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 */

define(['N/search', 'N/record', 'N/runtime'], function (search, record, runtime) {

	function getInputData() {
		var currentScript = runtime.getCurrentScript()
		var updateAll = currentScript.getParameter('custscript_nscs_update_all_vendors')
		var vendorID = currentScript.getParameter('custscript_nscs_vendor_id')
		// log.debug('Update All', updateAll)
		// log.debug('Vendor ID', vendorID)
		// vendorID = '7654'
		var filters
		if (updateAll == 'true') {
			// log.debug('Filter is empty')
			filters = []
		}
		else if (updateAll == 'false') {
			// log.debug('Filter by id')
			filters = [["internalid", "anyof", vendorID]]
		}
		return search.create({
			type: "vendor",
			filters: filters,
			columns:
				[
					search.createColumn({
						name: "entityid",
						sort: search.Sort.ASC,
						label: "Name"
					}),
					search.createColumn({
						name: "name",
						join: "mseSubsidiary",
						label: "Name"
					}),
					search.createColumn({
						name: "internalid",
						join: "mseSubsidiary",
						label: "Internal ID"
					})
				]
		})
	}

	function map(context) {

		// log.debug('Map', context)
		var value = JSON.parse(context.value)
		// log.debug('Parsed Values', value)
		// log.debug('Key', context.key)
		// log.debug('Subsidiary ID', value.values['internalid.mseSubsidiary'].value)

		var customVendorSubsidiaryRecordSearch = search.create({
			type: "customrecord_ns_vendorsub",
			filters:
				[
					["custrecord_ns_vendor.internalid", "anyof", context.key],
					"AND",
					["custrecord_ns_subsidiary.internalid", "anyof", value.values['internalid.mseSubsidiary'].value]
				],
			columns:
				[
					search.createColumn({
						name: "name",
						sort: search.Sort.ASC,
						label: "Name"
					}),
					search.createColumn({ name: "custrecord_ns_vendor", label: "Vendor" })
				]
		})

		// log.debug('Created Search')
		var resultCount = 0
		customVendorSubsidiaryRecordSearch.run().each(function (result) {
			// log.debug('Result', result)
			resultCount += 1
			return true
		})
		var createRecord = true
		// log.debug('Result Count', resultCount)
		if (resultCount > 0) {
			createRecord = false
		}

		context.write({
			key: context.key,
			value: {
				'subName': value.values['name.mseSubsidiary'],
				'subID': value.values['internalid.mseSubsidiary'],
				'createRecord': createRecord
			}
		})
	}

	function reduce(context) {

		// log.debug('Reduce', context)

		var vendorID = context.key
		// log.debug('Vendor ID', vendorID)
		var numberOfSubsidiaries = context.values.length
		// log.debug('Number of Subsidiaries', numberOfSubsidiaries)
		var numberOfRecordsCreated = 0
		for (var i = 0; i < numberOfSubsidiaries; i++) {
			var values = JSON.parse(context.values[i])
			// log.debug('Values', values)

			if (values.createRecord == true) {
				var vendorSubsidiaryRecord = record.create({
					type: 'customrecord_ns_vendorsub'
				})
				vendorSubsidiaryRecord.setText({
					fieldId: 'name',
					text: values.subName,
					ignoreFieldChange: true
				})
				vendorSubsidiaryRecord.setValue({
					fieldId: 'custrecord_ns_vendor',
					value: vendorID,
					ignoreFieldChange: true
				})
				vendorSubsidiaryRecord.setValue({
					fieldId: 'custrecord_ns_subsidiary',
					value: values.subID.value,
					ignoreFieldChange: true
				})
				// log.debug('Vendor Sub Record', vendorSubsidiaryRecord)

				var recordID = vendorSubsidiaryRecord.save()
				log.debug('Created Vendor Subsidiary Record', 'ID: ' + recordID)
				numberOfRecordsCreated += 1
			}
		}
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