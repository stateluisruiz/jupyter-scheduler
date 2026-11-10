"""Email tag rules for scheduled job definitions."""

import json
from unittest.mock import Mock, patch

import pytest
from tornado.httpclient import HTTPClientError

from jupyter_scheduler.models import CreateJob, CreateJobDefinition, UpdateJobDefinition
from jupyter_scheduler.orm import Job, JobDefinition
from jupyter_scheduler.pydantic_v1 import ValidationError


def _definition(**overrides):
    payload = {
        "input_uri": "helloworld.ipynb",
        "runtime_environment_name": "default",
        "name": "hello world",
        "output_formats": ["ipynb"],
        "schedule": "* * * * *",
        "timezone": "UTC",
        "tags": ["user@state.co.us"],
    }
    payload.update(overrides)
    return CreateJobDefinition(**payload)


def test_create_accepts_one_and_five_email_tags():
    one = _definition(tags=["user@state.co.us"])
    five = _definition(tags=[f"user{i}@state.co.us" for i in range(5)])
    trimmed = _definition(tags=["  user@state.co.us  "])

    assert one.tags == ["user@state.co.us"]
    assert len(five.tags) == 5
    assert trimmed.tags == ["user@state.co.us"]


@pytest.mark.parametrize(
    "tags",
    [
        None,
        [],
        [" "],
        ["not-an-email"],
        ["user@"],
        ["a b@state.co.us"],
        [f"user{i}@state.co.us" for i in range(6)],
    ],
)
def test_create_rejects_invalid_email_tags(tags):
    with pytest.raises(ValidationError, match="email tag"):
        _definition(tags=tags)


def test_update_rejects_invalid_email_tags_and_allows_omitted_tags():
    assert UpdateJobDefinition(active=False).tags is None
    assert UpdateJobDefinition(tags=["  second@state.co.us "]).tags == ["second@state.co.us"]

    with pytest.raises(ValidationError, match="email tag"):
        UpdateJobDefinition(tags=[])
    with pytest.raises(ValidationError, match="email tag"):
        UpdateJobDefinition(tags=["not-an-email"])
    with pytest.raises(ValidationError, match="email tag"):
        UpdateJobDefinition(tags=[f"user{i}@state.co.us" for i in range(6)])


def test_create_job_still_accepts_legacy_tags():
    """Unedited definitions may still carry free-text tags onto a later run."""
    job = CreateJob(
        input_uri="helloworld.ipynb",
        runtime_environment_name="default",
        name="legacy",
        tags=["not-an-email"],
    )
    assert job.tags == ["not-an-email"]


def _create_definition(jp_scheduler, **overrides):
    with patch("jupyter_scheduler.scheduler.Scheduler.file_exists", return_value=True), patch(
        "jupyter_scheduler.scheduler.Scheduler.copy_input_file"
    ):
        return jp_scheduler.create_job_definition(_definition(**overrides))


def test_tags_only_update_is_persisted_without_reloading_cron(jp_scheduler, jp_scheduler_db):
    job_definition_id = _create_definition(jp_scheduler)

    with patch.object(jp_scheduler.task_runner, "update_job_definition") as reload_cron:
        jp_scheduler.update_job_definition(
            job_definition_id,
            UpdateJobDefinition(
                schedule="* * * * *",
                timezone="UTC",
                input_uri="helloworld.ipynb",
                tags=["second@state.co.us"],
            ),
        )

    reload_cron.assert_not_called()
    with jp_scheduler_db() as session:
        definition = session.get(JobDefinition, job_definition_id)
        assert definition.tags == ["second@state.co.us"]
        assert definition.schedule == "* * * * *"


def test_update_without_tags_leaves_stored_tags(jp_scheduler, jp_scheduler_db):
    job_definition_id = _create_definition(jp_scheduler)

    jp_scheduler.update_job_definition(
        job_definition_id,
        UpdateJobDefinition(schedule="*/5 * * * *", timezone="UTC"),
    )

    with jp_scheduler_db() as session:
        definition = session.get(JobDefinition, job_definition_id)
        assert definition.tags == ["user@state.co.us"]
        assert definition.schedule == "*/5 * * * *"


def test_pause_and_resume_do_not_clear_tags(jp_scheduler, jp_scheduler_db):
    job_definition_id = _create_definition(jp_scheduler)

    with patch.object(jp_scheduler.task_runner, "update_job_definition"):
        jp_scheduler.update_job_definition(job_definition_id, UpdateJobDefinition(active=False))
        jp_scheduler.update_job_definition(job_definition_id, UpdateJobDefinition(active=True))

    with jp_scheduler_db() as session:
        definition = session.get(JobDefinition, job_definition_id)
        assert definition.active
        assert definition.tags == ["user@state.co.us"]


@pytest.mark.parametrize(
    "update",
    [
        UpdateJobDefinition(schedule="*/5 * * * *", timezone="UTC"),
        UpdateJobDefinition(schedule="* * * * *", timezone="America/New_York"),
        UpdateJobDefinition(
            schedule="* * * * *",
            timezone="UTC",
            input_uri="other.ipynb",
        ),
    ],
)
def test_schedule_timezone_or_input_change_reloads_cron(jp_scheduler, jp_scheduler_db, update):
    job_definition_id = _create_definition(jp_scheduler)

    with patch("jupyter_scheduler.scheduler.Scheduler.copy_input_file"), patch.object(
        jp_scheduler.task_runner, "update_job_definition"
    ) as reload_cron:
        jp_scheduler.update_job_definition(job_definition_id, update)

    reload_cron.assert_called_once()
    with jp_scheduler_db() as session:
        definition = session.get(JobDefinition, job_definition_id)
        assert definition.tags == ["user@state.co.us"]
        if update.schedule:
            assert definition.schedule == update.schedule
        if update.timezone:
            assert definition.timezone == update.timezone
        if update.input_uri:
            assert definition.input_filename == "other.ipynb"


def test_edited_tags_are_copied_onto_the_next_run_only(jp_scheduler, jp_scheduler_db):
    job_definition_id = _create_definition(jp_scheduler)

    with jp_scheduler_db() as session:
        previous = Job(
            job_definition_id=job_definition_id,
            name="previous run",
            input_filename="helloworld.ipynb",
            runtime_environment_name="default",
            tags=["user@state.co.us"],
        )
        session.add(previous)
        session.commit()
        previous_job_id = previous.job_id

    jp_scheduler.update_job_definition(
        job_definition_id,
        UpdateJobDefinition(
            schedule="* * * * *",
            timezone="UTC",
            input_uri="helloworld.ipynb",
            tags=["second@state.co.us"],
        ),
    )

    process = Mock()
    process.pid = 1
    with patch("jupyter_scheduler.scheduler.Scheduler.copy_input_file"), patch(
        "jupyter_scheduler.executors.DefaultExecutionManager.validate", return_value=True
    ), patch("jupyter_scheduler.scheduler.mp.get_context") as get_context:
        get_context.return_value.Process.return_value = process
        jp_scheduler.task_runner.create_job(job_definition_id)

    with jp_scheduler_db() as session:
        previous_run = session.get(Job, previous_job_id)
        new_runs = (
            session.query(Job)
            .filter(Job.job_definition_id == job_definition_id, Job.job_id != previous_job_id)
            .all()
        )
        assert previous_run.tags == ["user@state.co.us"]
        assert len(new_runs) == 1
        assert new_runs[0].tags == ["second@state.co.us"]


async def test_api_rejects_invalid_email_tags(jp_fetch):
    create_payload = {
        "input_uri": "notebook.ipynb",
        "name": "a job",
        "runtime_environment_name": "environment_a",
        "tags": ["not-an-email"],
    }
    with pytest.raises(HTTPClientError) as create_error:
        await jp_fetch(
            "scheduler",
            "job_definitions",
            method="POST",
            body=json.dumps(create_payload),
        )
    assert create_error.value.code == 400
    assert "email tag" in create_error.value.response.body.decode().lower()

    with pytest.raises(HTTPClientError) as update_error:
        await jp_fetch(
            "scheduler",
            "job_definitions",
            "def-1",
            method="PATCH",
            body=json.dumps({"tags": [f"user{i}@state.co.us" for i in range(6)]}),
        )
    assert update_error.value.code == 400
    assert "email tag" in update_error.value.response.body.decode().lower()
