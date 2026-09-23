/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * EC Schema XML for Open Cloud CAD feature history.
 *
 * Defines CadFeature entity (stores parametric feature records)
 * and FeatureCreatesElement relationship (feature → geometry).
 */

export const OPENCAD_SCHEMA_VERSION = '01.00.00';
export const OPENCAD_SCHEMA_NAME = 'OpenCloudCAD';

/**
 * EC Schema XML string for import via IModelDb.importSchemaStrings().
 * CadFeature stores the parametric history record for each CAD operation.
 */
export const OPENCAD_SCHEMA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ECSchema schemaName="OpenCloudCAD" alias="ocad" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
  <ECSchemaReference name="BisCore" version="01.00.16" alias="bis"/>
  <ECSchemaReference name="CoreCustomAttributes" version="01.00.03" alias="CoreCA"/>

  <ECEntityClass typeName="CadFeature" modifier="Sealed" displayLabel="CAD Feature">
    <BaseClass>bis:InformationRecordElement</BaseClass>
    <ECProperty propertyName="FeatureType" typeName="string" displayLabel="Feature Type"
      description="Type key for the CAD operation, e.g. Extrude, Revolve, Boolean.Unite"/>
    <ECProperty propertyName="Parameters" typeName="string" displayLabel="Parameters"
      description="JSON-serialized parameters for the feature operation"/>
    <ECProperty propertyName="FeatureOrder" typeName="int" displayLabel="Order"
      description="Position of this feature in the parametric history sequence"/>
    <ECProperty propertyName="Suppressed" typeName="boolean" displayLabel="Suppressed"
      description="Whether this feature is temporarily disabled"/>
  </ECEntityClass>

  <ECRelationshipClass typeName="FeatureCreatesElement" modifier="Sealed" strength="referencing" displayLabel="Feature Creates Element">
    <BaseClass>bis:ElementRefersToElements</BaseClass>
    <Source multiplicity="(0..1)" polymorphic="true" roleLabel="creates">
      <Class class="CadFeature"/>
    </Source>
    <Target multiplicity="(0..*)" polymorphic="true" roleLabel="was created by">
      <Class class="bis:Element"/>
    </Target>
  </ECRelationshipClass>

</ECSchema>`;
