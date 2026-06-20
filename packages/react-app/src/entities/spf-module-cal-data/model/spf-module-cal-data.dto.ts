/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface CalDataDto {
  changeInfo: ChangeInfoDto;
  Ckv: KeyValueDto[];
  parameters: ParameterDetailDto[];
  systemId: string;
}

export interface KeyValueDto {
  key: {keyId: number; name: string; systemId: string};
  value: {name: string; systemId: string; valueId: number};
}

export interface ParameterDetailDto {
  changeInfo: ChangeInfoDto;
  deprecated?: boolean;
  description?: string;
  elements: AnyElementDto[];
  isHidden?: boolean;
  isNeuralNet?: boolean;
  isOffloaded?: boolean;
  isReadOnly?: boolean;
  name: string;
  parameterId: string;
  systemId: string;
  toolPolicy?: ('CALIBRATION' | 'RTC' | 'RTM' | 'RTC_READONLY')[];
}

export type AnyElementDto =
  | ConfigElementDto
  | ElementTemplateArrayDto
  | StructDto;

export type DisplayType =
  | 'TEXT_BOX'
  | 'DB_TEXT_BOX'
  | 'Q_FORMATTED_VALUE'
  | 'SLIDER'
  | 'CHECK_BOX'
  | 'DROP_DOWN'
  | 'DUMP'
  | 'FILE'
  | 'BIT_FIELD'
  | 'FORMULA'
  | 'STRING_FIELD';

export interface ConfigElementDto {
  allowedValues?: (NameValuePairDto | BitFieldDto)[];
  description?: string;
  displayType?: DisplayType;
  group?: string;
  isReadOnly: boolean;
  linkedElementNames?: string[];
  max?: number;
  min?: number;
  name: string;
  policy?: 'HIDDEN' | 'BASIC' | 'ADVANCED';
  precision?: number;
  qFormat?: string;
  subgroup?: string;
  type: 'CONFIG_ELEMENT';
  unit?: string;
  value: string;
}

export interface ElementTemplateArrayDto {
  description?: string;
  group?: string;
  isReadOnly: boolean;
  length?: number;
  lengthFormula?: string;
  name: string;
  subgroup?: string;
  template: AnyElementDto[];
  type: 'ELEMENT_TEMPLATE_ARRAY';
  value: AnyElementDto[];
}

export interface StructDto {
  description?: string;
  group?: string;
  isReadOnly: boolean;
  name: string;
  structType: string;
  subgroup?: string;
  type: 'STRUCT';
  value: AnyElementDto[];
}

export interface NameValuePairDto {
  name: string;
  type: 'NAME_VALUE_PAIR';
  value: string;
}

export interface BitFieldDto {
  allowedValues: NameValuePairDto[];
  bitMask: string;
  description?: string;
  name: string;
  type: 'BIT_FIELD';
}

export interface ChangeInfoDto {
  changeId?: string;
  changeStatus?: 'STAGED' | 'UNSTAGED';
  changeType: 'NONE' | 'CREATE' | 'UPDATE' | 'DELETE';
}

export interface UpdateSpfModuleCalDataRequest {
  data: ParameterDetailDto[];
}

export interface ClipboardPayload {
  items: {path: string; value: string}[];
}

export type TreeViewNotification = {
  message: string;
  type: 'success' | 'error' | 'info';
};
