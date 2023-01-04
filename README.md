vb-distribution.git

Background:
- This process allows the bill from a vendor to be shared across subsidiaries in NetSuite.

Requirements:
- SDF Must be installed and turned on so that we can move the code to customer’s environment.
- Shared Vendor Bill folder must be setup in DevTools. Customer folder must be setup in DevTools.
- Representing Customer and Representing Vendor must be setup in NetSuite. If not, email Functional Consultant.

Configuration:
- Confirm Representing Customer and Representing Vendor creation in NetSuite. 
    - Click on Setup > Company > Subsidiaries
    - In each Subsidiary record (excluding Elimination), there should be a Representing Vendor and Customer field set to an entity.
    - The system-populated Representing Vendor and Customer should be set in the custom "Interco Entity" field on the Subsidiary record, this is what the script will use.
    
Process:
- The script will create an Advanced Intercompany Journal Entry that splits the bill between the header and line subsidiaries.