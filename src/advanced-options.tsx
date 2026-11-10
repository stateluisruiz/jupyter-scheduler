import React, { ChangeEvent, useEffect } from 'react';

import { FormHelperText, FormLabel, Stack, TextField } from '@mui/material';

import { Cluster } from './components/cluster';
import { AddButton, DeleteButton } from './components/icon-buttons';
import { useTranslator } from './hooks';
import { JobsView } from './model';
import { Scheduler } from './tokens';
import { LabeledValue } from './components/labeled-value';
import {
  emailTagErrors,
  MAX_EMAIL_TAGS,
  TagFieldError,
  TagListError
} from './util/tag-validation';

function tagsAreEditable(jobsView: JobsView): boolean {
  return (
    jobsView === JobsView.CreateForm || jobsView === JobsView.EditJobDefinition
  );
}

function tagsAreRequired(props: Scheduler.IAdvancedOptionsProps): boolean {
  if (props.jobsView === JobsView.EditJobDefinition) {
    return true;
  }
  if (props.jobsView === JobsView.CreateForm) {
    return props.model.createType === 'JobDefinition';
  }
  return false;
}

const AdvancedOptions = (
  props: Scheduler.IAdvancedOptionsProps
): JSX.Element => {
  const formPrefix = 'jp-create-job-advanced-';

  const trans = useTranslator('jupyterlab');
  const editable = tagsAreEditable(props.jobsView);
  const required = tagsAreRequired(props);
  const createType =
    props.jobsView === JobsView.CreateForm ? props.model.createType : undefined;

  const fieldMessage = (error: TagFieldError): string => {
    if (error === 'blank') {
      return trans.__('Enter an email address');
    }
    return trans.__('Enter a valid email address');
  };

  const listMessage = (error: TagListError): string => {
    if (error === 'required') {
      return trans.__('At least one email tag is required');
    }
    if (error === 'max') {
      return trans.__('At most 5 email tags are allowed');
    }
    return '';
  };

  useEffect(() => {
    if (!editable) {
      return;
    }

    const result = emailTagErrors(props.model.tags, required);
    const next: Scheduler.ErrorsType = {};
    const summary = listMessage(result.list);
    if (summary) {
      next.tags = summary;
    }
    Object.entries(result.fields).forEach(([idx, error]) => {
      next[`tag-${idx}`] = fieldMessage(error);
    });
    props.handleErrorsChange(next);
  }, [props.model.tags, props.jobsView, createType]);

  const updateTags = (tags: string[]) => {
    if (props.jobsView === JobsView.CreateForm) {
      props.handleModelChange({
        ...props.model,
        tags
      });
    } else if (props.jobsView === JobsView.EditJobDefinition) {
      props.handleModelChange({
        ...props.model,
        tags
      });
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (props.jobsView !== JobsView.CreateForm) {
      return;
    }

    props.handleModelChange({
      ...props.model,
      [e.target.name]: e.target.value
    });
  };

  const handleTagChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!editable) {
      return;
    }

    const { name, value } = event.target;
    const tagIdxMatch = name.match(/^tag-(\d+)$/);

    if (tagIdxMatch === null) {
      return;
    }

    const newTags = [...(props.model.tags ?? [])];
    newTags[parseInt(tagIdxMatch[1])] = value;
    updateTags(newTags);
  };

  const addTag = () => {
    if (!editable || (props.model.tags ?? []).length >= MAX_EMAIL_TAGS) {
      return;
    }

    updateTags([...(props.model.tags ?? []), '']);
  };

  const deleteTag = (idx: number) => {
    if (!editable) {
      return;
    }

    const newTags = [...(props.model.tags ?? [])];
    newTags.splice(idx, 1);
    updateTags(newTags);
  };

  const tags = props.model.tags ?? [];

  const createTags = () => {
    return (
      <Stack spacing={2}>
        {tags.map((tag, idx) => (
          <Cluster key={idx} justifyContent="flex-start">
            <TextField
              label={trans.__('Tag %1', idx + 1)}
              id={`${formPrefix}tag-${idx}`}
              name={`tag-${idx}`}
              value={tag}
              onChange={handleTagChange}
              error={!!props.errors[`tag-${idx}`]}
              helperText={props.errors[`tag-${idx}`] ?? ''}
            />
            <DeleteButton
              onClick={() => {
                deleteTag(idx);
                return false;
              }}
              title={trans.__('Delete tag %1', idx + 1)}
              addedStyle={{ marginTop: '4px' }}
            />
          </Cluster>
        ))}
        {tags.length < MAX_EMAIL_TAGS && (
          <Cluster justifyContent="flex-start">
            <AddButton
              onClick={() => {
                addTag();
                return false;
              }}
              title={trans.__('Add new tag')}
            />
          </Cluster>
        )}
      </Stack>
    );
  };

  const showTags = () => {
    if (!props.model.tags) {
      return (
        <Stack spacing={2}>
          <p>
            <em>{trans.__('No tags')}</em>
          </p>
        </Stack>
      );
    }

    return (
      <Stack spacing={2}>
        {tags.map((tag, idx) => (
          <LabeledValue
            label={trans.__('Tag %1', idx + 1)}
            id={`${formPrefix}tag-${idx}`}
            name={`tag-${idx}`}
            value={tag}
          />
        ))}
      </Stack>
    );
  };

  const tagsDisplay: JSX.Element | null = editable ? createTags() : showTags();

  const idemTokenLabel = trans.__('Idempotency token');
  const idemTokenName = 'idempotencyToken';
  const idemTokenId = `${formPrefix}${idemTokenName}`;
  const helperText = required
    ? trans.__('Each tag is an email address. 1 to 5 required.')
    : trans.__('Each tag is an email address. Up to 5.');

  return (
    <Stack spacing={4}>
      {props.jobsView === JobsView.JobDetail && (
        <LabeledValue
          label={idemTokenLabel}
          value={props.model.idempotencyToken}
          id={`${formPrefix}idempotencyToken`}
          name={idemTokenName}
        />
      )}
      {props.jobsView === JobsView.CreateForm &&
        props.model.createType === 'Job' && (
          <TextField
            label={idemTokenLabel}
            variant="outlined"
            onChange={handleInputChange}
            value={props.model.idempotencyToken}
            id={idemTokenId}
            name={idemTokenName}
          />
        )}
      <FormLabel component="legend">{trans.__('Tags')}</FormLabel>
      {editable && <FormHelperText>{helperText}</FormHelperText>}
      {editable && props.errors.tags && (
        <FormHelperText error>{props.errors.tags}</FormHelperText>
      )}
      {tagsDisplay}
    </Stack>
  );
};

export default AdvancedOptions;
