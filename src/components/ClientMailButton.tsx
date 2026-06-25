'use client';

import React, { useState } from 'react';
import { Loader2, Mail, Send, X } from 'lucide-react';
import styles from './ClientMailButton.module.css';

type RequirementStatus = 'pending' | 'missing' | 'checked' | 'overridden';

type ReviewRequirement = {
  id: string;
  text: string;
  status: RequirementStatus;
};

type ReviewItem = {
  creditName: string;
  subCreditName: string;
  preRequirements: ReviewRequirement[];
  finalRequirements: ReviewRequirement[];
};

type ReviewResponse = {
  project: { id: string; name: string; type: 'NB' | 'GH' };
  items: ReviewItem[];
};

type FiltrationResponse = {
  phase: 'pre' | 'final';
  groups: Array<{
    creditName: string;
    subCreditName: string;
    requirements: Array<{
      id: string;
      requirementName: string;
      status: RequirementStatus;
    }>;
  }>;
};

interface ClientMailButtonProps {
  projectId: string;
  projectName?: string;
  projectType?: string;
  disabled?: boolean;
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:5000';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isOutstanding = (status: RequirementStatus) => status === 'pending' || status === 'missing';

export default function ClientMailButton({
  projectId,
  projectName,
  projectType,
  disabled = false,
}: ClientMailButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [clientEmail, setClientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const closeModal = () => {
    if (isSending) return;
    setIsOpen(false);
    setMessage('');
    setError('');
  };

  const generateDraft = async () => {
    if (!projectId) return;
    setIsGenerating(true);
    setError('');
    setMessage('');

    try {
      const [reviewResponse, preResponse, finalResponse] = await Promise.all([
        fetch(`${apiBase}/api/checklists/review/${projectId}`),
        fetch(`${apiBase}/api/checklists/review/${projectId}/filtration/pre`),
        fetch(`${apiBase}/api/checklists/review/${projectId}/filtration/final`),
      ]);

      if (!reviewResponse.ok) {
        const payload = await reviewResponse.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to load checklist review data.');
      }

      const reviewPayload = await reviewResponse.json();
      const review = reviewPayload.data as ReviewResponse;
      const filtrationPayloads = await Promise.all([
        preResponse.ok ? preResponse.json() : Promise.resolve(null),
        finalResponse.ok ? finalResponse.json() : Promise.resolve(null),
      ]);
      const filtrationResults = filtrationPayloads
        .map((payload) => payload?.data as FiltrationResponse | undefined)
        .filter(Boolean) as FiltrationResponse[];

      const allReviewRequirements = review.items.flatMap((item) => [
        ...item.preRequirements.map((requirement) => ({
          key: `pre:${requirement.id}`,
          phase: 'Pre Certification',
          credit: item.creditName,
          subCredit: item.subCreditName,
          text: requirement.text,
          status: requirement.status,
        })),
        ...item.finalRequirements.map((requirement) => ({
          key: `final:${requirement.id}`,
          phase: 'Final Certification',
          credit: item.creditName,
          subCredit: item.subCreditName,
          text: requirement.text,
          status: requirement.status,
        })),
      ]);

      const requirementMap = new Map(
        allReviewRequirements
          .filter((requirement) => isOutstanding(requirement.status))
          .map((requirement) => [requirement.key, requirement]),
      );

      filtrationResults.forEach((result) => {
        result.groups.forEach((group) => {
          group.requirements
            .filter((requirement) => isOutstanding(requirement.status))
            .forEach((requirement) => {
              const key = `${result.phase}:${requirement.id}`;
              if (!requirementMap.has(key)) {
                requirementMap.set(key, {
                  key,
                  phase: result.phase === 'pre' ? 'Pre Certification' : 'Final Certification',
                  credit: group.creditName,
                  subCredit: group.subCreditName,
                  text: requirement.requirementName,
                  status: requirement.status,
                });
              }
            });
        });
      });

      const totalRequirements = allReviewRequirements.length;
      const completedRequirements = allReviewRequirements.filter(
        (requirement) => requirement.status === 'checked' || requirement.status === 'overridden',
      ).length;
      const progress = totalRequirements > 0
        ? Math.round((completedRequirements / totalRequirements) * 100)
        : 0;
      const outstanding = Array.from(requirementMap.values());
      const resolvedProjectName = review.project.name || projectName || 'Selected Project';
      const resolvedProjectType = review.project.type || projectType || 'Project';
      const requirementLines = outstanding.length > 0
        ? outstanding.map((requirement, index) => (
            `${index + 1}. [${requirement.status.toUpperCase()}] ${requirement.phase} - ${requirement.credit}${requirement.subCredit ? ` / ${requirement.subCredit}` : ''}\n   ${requirement.text}`
          ))
        : ['No pending or missing requirements were found.'];

      setSubject(`Required documents and information - ${resolvedProjectName}`);
      setBody([
        'Dear Client,',
        '',
        `Project Name: ${resolvedProjectName}`,
        `Project Type: ${resolvedProjectType}`,
        `Current Progress: ${progress}%`,
        '',
        'Missing / Pending Requirements:',
        ...requirementLines,
        '',
        'Kindly submit the required documents and information at your earliest convenience so that we can continue the certification process.',
        '',
        'Please contact us if you need clarification regarding any requirement.',
        '',
        'Regards,',
        'Project Management Team',
      ].join('\n'));
      setIsOpen(true);
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : 'Failed to generate client mail draft.');
    } finally {
      setIsGenerating(false);
    }
  };

  const sendClientMail = async () => {
    const recipient = clientEmail.trim();
    const cleanSubject = subject.trim();
    const cleanBody = body.trim();
    setError('');
    setMessage('');

    if (!recipient) {
      setError('Client email is required.');
      return;
    }
    if (!emailPattern.test(recipient)) {
      setError('Please enter a valid client email.');
      return;
    }
    if (!cleanSubject || !cleanBody) {
      setError('Email subject and body are required.');
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch(`${apiBase}/api/mail/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipient,
          subject: cleanSubject,
          text: cleanBody,
          projectId,
          projectName,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to send client mail.');
      setMessage(payload?.message || 'Client mail sent successfully.');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send client mail.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={styles.clientMailButton}
        onClick={generateDraft}
        disabled={disabled || !projectId || isGenerating}
      >
        {isGenerating ? <Loader2 size={15} className={styles.spinner} /> : <Mail size={15} />}
        {isGenerating ? 'Preparing...' : 'Client Mail'}
      </button>

      {error && !isOpen && <span className={styles.inlineError}>{error}</span>}

      {isOpen && (
        <div className={styles.overlay} onClick={closeModal}>
          <div className={`${styles.modal} glassmorphism`} onClick={(event) => event.stopPropagation()}>
            <div className={styles.header}>
              <div>
                <h2>Client Mail</h2>
                <span>Review and edit before sending</span>
              </div>
              <button type="button" className={styles.closeButton} onClick={closeModal} aria-label="Close client mail">
                <X size={18} />
              </button>
            </div>

            <div className={styles.content}>
              <label>
                <span>Client Email</span>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(event) => setClientEmail(event.target.value)}
                  placeholder="client@example.com"
                  disabled={isSending}
                />
              </label>
              <label>
                <span>Email Subject</span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  disabled={isSending}
                />
              </label>
              <label className={styles.bodyField}>
                <span>Email Body</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  disabled={isSending}
                />
              </label>
              {error && <div className={styles.errorMessage}>{error}</div>}
              {message && <div className={styles.successMessage}>{message}</div>}
            </div>

            <div className={styles.footer}>
              <button type="button" className={styles.cancelButton} onClick={closeModal} disabled={isSending}>
                Cancel
              </button>
              <button type="button" className={styles.sendButton} onClick={sendClientMail} disabled={isSending}>
                {isSending ? <Loader2 size={16} className={styles.spinner} /> : <Send size={16} />}
                {isSending ? 'Sending...' : 'Send Mail'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
