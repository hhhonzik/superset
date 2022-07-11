/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { FunctionComponent, useCallback, useState } from 'react';
import { Radio } from 'src/components/Radio';
import { RadioChangeEvent, Select } from 'src/components';
import { Input } from 'src/components/Input';
import StyledModal from 'src/components/Modal';
import Button from 'src/components/Button';
import {
  styled,
  t,
  SupersetClient,
  JsonResponse,
  JsonObject,
  QueryResponse,
} from '@superset-ui/core';
import { useSelector, useDispatch } from 'react-redux';
import moment from 'moment';
import rison from 'rison';
import { createDatasource } from 'src/SqlLab/actions/sqlLab';
import { addDangerToast } from 'src/components/MessageToasts/actions';
import { UserWithPermissionsAndRoles as User } from 'src/types/bootstrapTypes';
import {
  DatasetRadioState,
  EXPLORE_CHART_DEFAULT,
  DatasetOwner,
  SqlLabExploreRootState,
  getInitialState,
  ExploreDatasource,
  SqlLabRootState,
} from 'src/SqlLab/types';
import { mountExploreUrl } from 'src/explore/exploreUtils';
import { postFormData } from 'src/explore/exploreUtils/formData';
import { URL_PARAMS } from 'src/constants';
import { SelectValue } from 'antd/lib/select';
import { isEmpty } from 'lodash';

interface SaveDatasetModalProps {
  visible: boolean;
  onHide: () => void;
  buttonTextOnSave: string;
  buttonTextOnOverwrite: string;
  modalDescription?: string;
  datasource: ExploreDatasource;
}

const Styles = styled.div`
  .sdm-body {
    margin: 0 8px;
  }
  .sdm-input {
    margin-left: 45px;
    width: 401px;
  }
  .sdm-autocomplete {
    width: 401px;
    align-self: center;
  }
  .sdm-radio {
    display: block;
    height: 30px;
    margin: 10px 0px;
    line-height: 30px;
  }
  .sdm-overwrite-msg {
    margin: 7px;
  }
  .sdm-overwrite-container {
    flex: 1 1 auto;
    display: flex;
  }
`;

const updateDataset = async (
  dbId: number,
  datasetId: number,
  sql: string,
  columns: Array<Record<string, any>>,
  owners: [number],
  overrideColumns: boolean,
) => {
  const endpoint = `api/v1/dataset/${datasetId}?override_columns=${overrideColumns}`;
  const headers = { 'Content-Type': 'application/json' };
  const body = JSON.stringify({
    sql,
    columns,
    owners,
    database_id: dbId,
  });

  const data: JsonResponse = await SupersetClient.put({
    endpoint,
    headers,
    body,
  });
  return data.json.result;
};

// eslint-disable-next-line no-empty-pattern
export const SaveDatasetModal: FunctionComponent<SaveDatasetModalProps> = ({
  visible,
  onHide,
  buttonTextOnSave,
  buttonTextOnOverwrite,
  modalDescription,
  datasource,
}) => {
  const defaultVizType = useSelector<SqlLabRootState, string>(
    state => state.common?.conf?.DEFAULT_VIZ_TYPE || 'table',
  );
  const query = datasource as QueryResponse;
  const getDefaultDatasetName = () =>
    `${query.tab} ${moment().format('MM/DD/YYYY HH:mm:ss')}`;
  const [datasetName, setDatasetName] = useState(getDefaultDatasetName());
  const [newOrOverwrite, setNewOrOverwrite] = useState(
    DatasetRadioState.SAVE_NEW,
  );
  const [shouldOverwriteDataset, setShouldOverwriteDataset] = useState(false);
  const [datasetToOverwrite, setDatasetToOverwrite] = useState<
    Record<string, any>
  >({});
  const [selectedDatasetToOverwrite, setSelectedDatasetToOverwrite] = useState<
    SelectValue | undefined
  >(undefined);

  const user = useSelector<SqlLabExploreRootState, User>(user =>
    getInitialState(user),
  );
  const dispatch = useDispatch<(dispatch: any) => Promise<JsonObject>>();

  const handleOverwriteDataset = async () => {
    const [, key] = await Promise.all([
      updateDataset(
        query.dbId,
        datasetToOverwrite.datasetid,
        query.sql,
        query.results.selected_columns.map(
          (d: { name: string; type: string; is_dttm: boolean }) => ({
            column_name: d.name,
            type: d.type,
            is_dttm: d.is_dttm,
          }),
        ),
        datasetToOverwrite.owners.map((o: DatasetOwner) => o.id),
        true,
      ),
      postFormData(datasetToOverwrite.datasetid, 'table', {
        ...EXPLORE_CHART_DEFAULT,
        datasource: `${datasetToOverwrite.datasetid}__table`,
        ...(defaultVizType === 'table' && {
          all_columns: query.results.selected_columns.map(
            column => column.name,
          ),
        }),
      }),
    ]);

    const url = mountExploreUrl(null, {
      [URL_PARAMS.formDataKey.name]: key,
    });
    window.open(url, '_blank', 'noreferrer');

    setShouldOverwriteDataset(false);
    setDatasetToOverwrite({});
    setDatasetName(getDefaultDatasetName());
  };

  const loadDatasetOverwriteOptions = useCallback(
    async (input = '') => {
      const { userId } = user;
      const queryParams = rison.encode({
        filters: [
          {
            col: 'table_name',
            opr: 'ct',
            value: input,
          },
          {
            col: 'owners',
            opr: 'rel_m_m',
            value: userId,
          },
        ],
        order_column: 'changed_on_delta_humanized',
        order_direction: 'desc',
      });

      return SupersetClient.get({
        endpoint: `/api/v1/dataset?q=${queryParams}`,
      }).then(response => ({
        data: response.json.result.map(
          (r: { table_name: string; id: number; owners: [DatasetOwner] }) => ({
            value: r.table_name,
            label: r.table_name,
            datasetid: r.id,
            owners: r.owners,
          }),
        ),
        totalCount: response.json.count,
      }));
    },
    [user],
  );

  const handleSaveInDataset = () => {
    // if user wants to overwrite a dataset we need to prompt them
    if (newOrOverwrite === DatasetRadioState.OVERWRITE_DATASET) {
      setShouldOverwriteDataset(true);
      return;
    }

    const selectedColumns = query.results.selected_columns || [];

    // The filters param is only used to test jinja templates.
    // Remove the special filters entry from the templateParams
    // before saving the dataset.
    if (query.templateParams) {
      const p = JSON.parse(query.templateParams);
      /* eslint-disable-next-line no-underscore-dangle */
      if (p._filters) {
        /* eslint-disable-next-line no-underscore-dangle */
        delete p._filters;
        // eslint-disable-next-line no-param-reassign
        query.templateParams = JSON.stringify(p);
      }
    }

    dispatch(
      createDatasource({
        schema: query.schema,
        sql: query.sql,
        dbId: query.dbId,
        templateParams: query.templateParams,
        datasourceName: datasetName,
        columns: selectedColumns,
      }),
    )
      .then((data: { table_id: number }) =>
        postFormData(data.table_id, 'table', {
          ...EXPLORE_CHART_DEFAULT,
          datasource: `${data.table_id}__table`,
          ...(defaultVizType === 'table' && {
            all_columns: selectedColumns.map(column => column.name),
          }),
        }),
      )
      .then((key: string) => {
        const url = mountExploreUrl(null, {
          [URL_PARAMS.formDataKey.name]: key,
        });
        window.open(url, '_blank', 'noreferrer');
      })
      .catch(() => {
        addDangerToast(t('An error occurred saving dataset'));
      });

    setDatasetName(getDefaultDatasetName());
    onHide();
  };

  const handleOverwriteDatasetOption = (value: SelectValue, option: any) => {
    setDatasetToOverwrite(option);
    setSelectedDatasetToOverwrite(value);
  };

  const handleDatasetNameChange = (e: React.FormEvent<HTMLInputElement>) => {
    // @ts-expect-error
    setDatasetName(e.target.value);
  };

  const handleOverwriteCancel = () => {
    setShouldOverwriteDataset(false);
    setDatasetToOverwrite({});
  };

  const disableSaveAndExploreBtn =
    (newOrOverwrite === DatasetRadioState.SAVE_NEW &&
      datasetName.length === 0) ||
    (newOrOverwrite === DatasetRadioState.OVERWRITE_DATASET &&
      isEmpty(selectedDatasetToOverwrite));

  const filterAutocompleteOption = (
    inputValue: string,
    option: { value: string; datasetid: number },
  ) => option.value.toLowerCase().includes(inputValue.toLowerCase());

  return (
    <StyledModal
      show={visible}
      title={t('Save or Overwrite Dataset')}
      onHide={onHide}
      footer={
        <>
          {!shouldOverwriteDataset && (
            <Button
              disabled={disableSaveAndExploreBtn}
              buttonStyle="primary"
              onClick={handleSaveInDataset}
            >
              {buttonTextOnSave}
            </Button>
          )}
          {shouldOverwriteDataset && (
            <>
              <Button onClick={handleOverwriteCancel}>Back</Button>
              <Button
                className="md"
                buttonStyle="primary"
                onClick={handleOverwriteDataset}
                disabled={disableSaveAndExploreBtn}
              >
                {buttonTextOnOverwrite}
              </Button>
            </>
          )}
        </>
      }
    >
      <Styles>
        {!shouldOverwriteDataset && (
          <div className="sdm-body">
            {modalDescription && (
              <div className="sdm-prompt">{modalDescription}</div>
            )}
            <Radio.Group
              onChange={(e: RadioChangeEvent) => {
                setNewOrOverwrite(Number(e.target.value));
              }}
              value={newOrOverwrite}
            >
              <Radio className="sdm-radio" value={1}>
                {t('Save as new')}
                <Input
                  className="sdm-input"
                  defaultValue={datasetName}
                  onChange={handleDatasetNameChange}
                  disabled={newOrOverwrite !== 1}
                />
              </Radio>
              <div className="sdm-overwrite-container">
                <Radio className="sdm-radio" value={2}>
                  {t('Overwrite existing')}
                </Radio>
                <div className="sdm-autocomplete">
                  <Select
                    allowClear
                    showSearch
                    placeholder={t('Select or type dataset name')}
                    ariaLabel={t('Existing dataset')}
                    onChange={handleOverwriteDatasetOption}
                    options={input => loadDatasetOverwriteOptions(input)}
                    value={selectedDatasetToOverwrite}
                    filterOption={filterAutocompleteOption}
                    disabled={newOrOverwrite !== 2}
                    getPopupContainer={() => document.body}
                  />
                </div>
              </div>
            </Radio.Group>
          </div>
        )}
        {shouldOverwriteDataset && (
          <div className="sdm-overwrite-msg">
            {t('Are you sure you want to overwrite this dataset?')}
          </div>
        )}
      </Styles>
    </StyledModal>
  );
};