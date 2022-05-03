import React, { useEffect, useState } from 'react';
import { useSimVar } from '@instruments/common/simVars';
import { useCoherentEvent, useInteractionEvents } from '@instruments/common/hooks';
import { AtsuMessageComStatus, AtsuMessageDirection, AtsuMessageType } from '@atsu/messages/AtsuMessage';
import { CpdlcMessage } from '@atsu/messages/CpdlcMessage';
import { CpdlcMessageExpectedResponseType } from '@atsu/messages/CpdlcMessageElements';
import { RequestMessage } from '@atsu/messages/RequestMessage';
import { DclMessage } from '@atsu/messages/DclMessage';
import { OclMessage } from '@atsu/messages/OclMessage';
import { DcduStatusMessage } from '@atsu/components/DcduLink';
import { OutputButtons } from './elements/OutputButtons';
import { AffirmNegativeButtons } from './elements/AffirmNegativeButtons';
import { WilcoUnableButtons } from './elements/WilcoUnableButtons';
import { RogerButtons } from './elements/RogerButtons';
import { CloseButtons } from './elements/CloseButtons';
import { RecallButtons } from './elements/RecallButtons';
import { render } from '../Common';
import { SelfTest } from './pages/SelfTest';
import { AtsuStatusMessage } from './elements/AtsuStatusMessage';
import { WaitingForData } from './pages/WaitingForData';
import { DcduLines } from './elements/DcduLines';
import { DatalinkMessage } from './elements/DatalinkMessage';
import { MessageStatus } from './elements/MessageStatus';
import { AtcStatus } from './elements/AtcStatus';
import { useUpdate } from '../util.js';

import './style.scss';

enum DcduState {
    Off,
    On,
    Selftest,
    Waiting,
    Standby
}

export class DcduMessageBlock {
    public messages: CpdlcMessage[] = [];

    public timestamp: number = 0;

    public response: number = -1;

    public statusMessage: DcduStatusMessage = DcduStatusMessage.NoMessage;

    public messageVisible: boolean = false;

    public automaticCloseTimeout: number = -1;
}

const sortedMessageArray = (messages: Map<number, DcduMessageBlock>): DcduMessageBlock[] => {
    const arrMessages = Array.from(messages.values());
    arrMessages.sort((a, b) => a.timestamp - b.timestamp);
    return arrMessages;
};

const DcduSystemStatusDuration = 5000;

const DCDU: React.FC = () => {
    const [electricityState] = useSimVar('L:A32NX_ELEC_DC_1_BUS_IS_POWERED', 'bool', 200);
    const [isColdAndDark] = useSimVar('L:A32NX_COLD_AND_DARK_SPAWN', 'Bool', 200);
    const [state, setState] = useState((isColdAndDark) ? DcduState.Off : DcduState.On);
    const [events] = useState(RegisterViewListener('JS_LISTENER_SIMVARS', undefined, true));
    const [timer, setTimer] = useState<number | null>(null);

    const [systemStatusMessage, setSystemStatusMessage] = useState(DcduStatusMessage.NoMessage);
    const [systemStatusTimer, setSystemStatusTimer] = useState<number | null>(null);
    const [messages, setMessages] = useState(new Map<number, DcduMessageBlock>());
    const [atcMessage, setAtcMessage] = useState('');

    const updateSystemStatusMessage = (status: DcduStatusMessage) => {
        setSystemStatusMessage(status);
        setSystemStatusTimer(5000);
    };

    const setMessageStatus = (uid: number, response: number) => {
        const updateMap = messages;

        const entry = updateMap.get(uid);
        if (entry !== undefined) {
            events.triggerToAllSubscribers('A32NX_ATSU_DCDU_MESSAGE_READ', uid);
            entry.response = response;
        }

        setMessages(updateMap);
    };

    const deleteMessage = (uid: number) => events.triggerToAllSubscribers('A32NX_ATSU_DELETE_MESSAGE', uid);
    const sendMessage = (uid: number) => events.triggerToAllSubscribers('A32NX_ATSU_SEND_MESSAGE', uid);
    const sendResponse = (uid: number, response: number) => events.triggerToAllSubscribers('A32NX_ATSU_SEND_RESPONSE', uid, response);

    // functions to handle the internal queue
    const recallMessage = () => {
        events.triggerToAllSubscribers('A32NX_ATSU_DCDU_MESSAGE_RECALL');
    };
    const closeMessage = (uid: number) => {
        const sortedMessages = sortedMessageArray(messages);
        const index = sortedMessages.findIndex((element) => element.messages[0].UniqueMessageID === uid);

        events.triggerToAllSubscribers('A32NX_ATSU_DCDU_MESSAGE_CLOSED', uid);

        if (index !== -1) {
            setSystemStatusMessage(DcduStatusMessage.NoMessage);
            setSystemStatusTimer(null);

            // update the map
            const updatedMap = messages;

            // define the next visible message
            if (index > 0) {
                const message = updatedMap.get(sortedMessages[index - 1].messages[0].UniqueMessageID);
                if (message) {
                    message.messageVisible = true;
                }
            } else if (index + 1 < sortedMessages.length) {
                const message = updatedMap.get(sortedMessages[index + 1].messages[0].UniqueMessageID);
                if (message) {
                    message.messageVisible = true;
                }
            }

            updatedMap.delete(uid);
            setMessages(updatedMap);
        }
    };

    // the message scroll button handling
    useInteractionEvents(['A32NX_DCDU_BTN_MPL_MS0MINUS', 'A32NX_DCDU_BTN_MPR_MS0MINUS'], () => {
        if (messages.size === 0) {
            return;
        }

        const sortedMessages = sortedMessageArray(messages);
        const index = sortedMessages.findIndex((element) => element.messageVisible);

        if (index === 0) {
            setSystemStatusMessage(DcduStatusMessage.NoMoreMessages);
            setSystemStatusTimer(DcduSystemStatusDuration);
        } else {
            setSystemStatusMessage(DcduStatusMessage.NoMessage);
            setSystemStatusTimer(null);

            const oldMessage = messages.get(sortedMessages[index].messages[0].UniqueMessageID);
            const newMessage = messages.get(sortedMessages[index - 1].messages[0].UniqueMessageID);
            if (oldMessage && newMessage) {
                oldMessage.messageVisible = false;
                newMessage.messageVisible = true;
                setMessages(messages);
            }
        }
    });
    useInteractionEvents(['A32NX_DCDU_BTN_MPL_MS0PLUS', 'A32NX_DCDU_BTN_MPR_MS0PLUS'], () => {
        if (messages.size === 0) {
            return;
        }

        const sortedMessages = sortedMessageArray(messages);
        const index = sortedMessages.findIndex((element) => element.messageVisible);

        if (index + 1 >= sortedMessages.length) {
            setSystemStatusMessage(DcduStatusMessage.NoMoreMessages);
            setSystemStatusTimer(DcduSystemStatusDuration);
        } else {
            setSystemStatusMessage(DcduStatusMessage.NoMessage);
            setSystemStatusTimer(null);

            const oldMessage = messages.get(sortedMessages[index].messages[0].UniqueMessageID);
            const newMessage = messages.get(sortedMessages[index + 1].messages[0].UniqueMessageID);
            if (oldMessage && newMessage) {
                oldMessage.messageVisible = false;
                newMessage.messageVisible = true;
                setMessages(messages);
            }
        }
    });
    useInteractionEvents(['A32NX_DCDU_BTN_MPL_PRINT', 'A32NX_DCDU_BTN_MPR_PRINT'], () => {
        const sortedMessages = sortedMessageArray(messages);
        const index = sortedMessages.findIndex((element) => element.messageVisible);
        if (index !== -1) {
            events.triggerToAllSubscribers('A32NX_ATSU_PRINT_MESSAGE', sortedMessages[index].messages[0].UniqueMessageID);
        }
    });

    useCoherentEvent('A32NX_DCDU_RESET', () => {
        setMessages(new Map<number, DcduMessageBlock>());
        setAtcMessage('');
        setSystemStatusMessage(DcduStatusMessage.NoMessage);
        setSystemStatusTimer(null);
    });

    // resynchronization with ATSU
    useCoherentEvent('A32NX_DCDU_MSG', (serializedMessages: any) => {
        const cpdlcMessages: CpdlcMessage[] = [];

        serializedMessages.forEach((serialized) => {
            if (serialized.UniqueMessageID !== undefined) {
                let cpdlcMessage : CpdlcMessage | undefined = undefined;
                if (serialized.Type === AtsuMessageType.CPDLC) {
                    cpdlcMessage = new CpdlcMessage();
                } else if (serialized.Type === AtsuMessageType.Request) {
                    cpdlcMessage = new RequestMessage();
                } else if (serialized.Type === AtsuMessageType.DCL) {
                    cpdlcMessage = new DclMessage();
                } else if (serialized.Type === AtsuMessageType.OCL) {
                    cpdlcMessage = new OclMessage();
                }

                if (cpdlcMessage !== undefined) {
                    cpdlcMessage.deserialize(serialized);
                    cpdlcMessages.push(cpdlcMessage);
                }
            }
        });

        if (cpdlcMessages.length !== 0) {
            const dcduBlock = messages.get(cpdlcMessages[0].UniqueMessageID);
            if (dcduBlock !== undefined) {
                // update the communication states and response
                dcduBlock.messages.forEach((message) => {
                    if (cpdlcMessages[0].ComStatus !== undefined) {
                        message.ComStatus = cpdlcMessages[0].ComStatus;
                    }
                    message.Response = cpdlcMessages[0].Response;
                });

                // response sent
                if (cpdlcMessages[0].Response !== undefined && cpdlcMessages[0].Response.ComStatus === AtsuMessageComStatus.Sent) {
                    dcduBlock.response = -1;
                }
            } else {
                const message = new DcduMessageBlock();
                message.messages = cpdlcMessages;
                message.timestamp = new Date().getTime();
                messages.set(cpdlcMessages[0].UniqueMessageID, message);
            }

            if (messages.size === 1) {
                const message = messages.get(cpdlcMessages[0].UniqueMessageID);
                if (message) {
                    message.messageVisible = true;
                }
            }

            setMessages(messages);
        }
    });
    useCoherentEvent('A32NX_DCDU_MSG_DELETE_UID', (uid: number) => {
        closeMessage(uid);
    });
    useCoherentEvent('A32NX_DCDU_ATC_LOGON_MSG', (message: string) => {
        setAtcMessage(message);
    });
    useCoherentEvent('A32NX_DCDU_SYSTEM_ATSU_STATUS', (status: DcduStatusMessage) => {
        setSystemStatusMessage(status);
        setSystemStatusTimer(5000);
    });
    useCoherentEvent('A32NX_DCDU_MSG_ATSU_STATUS', (uid: number, status: DcduStatusMessage) => {
        const dcduBlock = messages.get(uid);
        if (dcduBlock !== undefined) {
            dcduBlock.statusMessage = status;
            setMessages(messages);
        }
    });

    useUpdate((deltaTime) => {
        if (timer !== null) {
            if (timer > 0) {
                setTimer(timer - (deltaTime / 1000));
            } else if (state === DcduState.Off && electricityState !== 0) {
                setState(DcduState.Selftest);
                setTimer(6);
            } else if (state === DcduState.Selftest) {
                setState(DcduState.Waiting);
                setTimer(12);
            } else if (state === DcduState.Waiting) {
                setState(DcduState.On);
                setTimer(null);
            }
        }

        // check if the timeout of messages is triggered
        const currentTime = new Date().getTime() / 1000;
        const sortedArray = sortedMessageArray(messages);
        sortedArray.forEach((message) => {
            if (message.messages[0].CloseAutomatically) {
                if (message.messageVisible && message.automaticCloseTimeout < 0) {
                    const cpdlcMessage = message.messages[0];

                    // start the timeout
                    if (cpdlcMessage.Direction === AtsuMessageDirection.Downlink && cpdlcMessage.ComStatus === AtsuMessageComStatus.Sent
                        || cpdlcMessage.Direction === AtsuMessageDirection.Uplink && cpdlcMessage.Response?.Content?.TypeId !== 'DM2'
                        && cpdlcMessage.Response?.ComStatus === AtsuMessageComStatus.Sent) {
                        message.automaticCloseTimeout = new Date().getTime() / 1000;
                    }
                } else if (message.automaticCloseTimeout > 0 && (currentTime - message.automaticCloseTimeout) >= 2.0) {
                    // check if the timeout is reached
                    closeMessage(message.messages[0].UniqueMessageID);
                } else if (!message.messageVisible) {
                    // reset the timeout of invisible messages
                    message.automaticCloseTimeout = -1;
                }
            }
        });

        if (systemStatusTimer !== null) {
            if (systemStatusTimer > 0) {
                setSystemStatusTimer(systemStatusTimer - deltaTime);
            } else {
                setSystemStatusMessage(DcduStatusMessage.NoMessage);
                setSystemStatusTimer(null);
            }
        }
    });

    useEffect(() => {
        if (state === DcduState.On && electricityState === 0) {
            setState(DcduState.Standby);
        } else if (state === DcduState.Off && electricityState !== 0) {
            setState(DcduState.Selftest);
            setTimer(6);
        } else if (state === DcduState.Standby && electricityState !== 0) {
            setState(DcduState.On);
            setTimer(null);
        } else if (electricityState === 0) {
            setState(DcduState.Off);
            setTimer(null);
        }
    }, [electricityState]);

    // prepare the data
    let messageIndex = -1;
    let visibleMessages: CpdlcMessage[] | undefined = undefined;
    let visibleMessageStatus: DcduStatusMessage = DcduStatusMessage.NoMessage;
    let response: number = -1;
    if (state === DcduState.On && messages.size !== 0) {
        const arrMessages = sortedMessageArray(messages);

        messageIndex = arrMessages.findIndex((element) => element.messageVisible);
        if (messageIndex !== -1) {
            visibleMessages = arrMessages[messageIndex].messages;
            visibleMessageStatus = arrMessages[messageIndex].statusMessage;
            response = arrMessages[messageIndex].response;
        }

        // check if PRIORITY MSG + needs to be visualized
        let noUrgentMessage = true;
        arrMessages.forEach((message) => {
            if (message.messages[0].Content?.Urgent && !message.messageVisible) {
                if (systemStatusMessage !== DcduStatusMessage.PriorityMessage) {
                    setSystemStatusMessage(DcduStatusMessage.PriorityMessage);
                    setSystemStatusTimer(-1);
                }
                noUrgentMessage = false;
            }
        });

        if (noUrgentMessage && systemStatusMessage === DcduStatusMessage.PriorityMessage) {
            setSystemStatusMessage(DcduStatusMessage.NoMessage);
        }
    }

    let answerRequired = false;
    if (visibleMessages !== undefined && visibleMessages[0].Direction === AtsuMessageDirection.Uplink) {
        answerRequired = visibleMessages[0].Content?.ExpectedResponse !== CpdlcMessageExpectedResponseType.NotRequired
                         && visibleMessages[0].Content?.ExpectedResponse !== CpdlcMessageExpectedResponseType.No;
    }

    switch (state) {
    case DcduState.Selftest:
        return (
            <>
                <div className="BacklightBleed" />
                <SelfTest />
            </>
        );
    case DcduState.Waiting:
        return (
            <>
                <div className="BacklightBleed" />
                <WaitingForData />
            </>
        );
    case DcduState.Off:
        return <></>;
    default:
        return (
            <>
                <div className="BacklightBleed" />
                <svg className="dcdu">
                    {(visibleMessages === undefined && atcMessage !== '' && (
                        <>
                            <AtcStatus message={atcMessage} />
                        </>
                    )
                    )}
                    {(visibleMessages !== undefined && (
                        <>
                            <MessageStatus
                                message={visibleMessages[0]}
                                selectedResponse={response}
                            />
                            <DatalinkMessage
                                messages={visibleMessages}
                                updateSystemStatusMessage={updateSystemStatusMessage}
                            />
                        </>
                    ))}
                    {(visibleMessages !== undefined && answerRequired && visibleMessages[0].Content?.ExpectedResponse === CpdlcMessageExpectedResponseType.WilcoUnable && (
                        <WilcoUnableButtons
                            message={visibleMessages[0]}
                            selectedResponse={response}
                            setMessageStatus={setMessageStatus}
                            sendResponse={sendResponse}
                            closeMessage={closeMessage}
                        />
                    ))}
                    {(visibleMessages !== undefined && answerRequired && visibleMessages[0].Content?.ExpectedResponse === CpdlcMessageExpectedResponseType.AffirmNegative && (
                        <AffirmNegativeButtons
                            message={visibleMessages[0]}
                            selectedResponse={response}
                            setMessageStatus={setMessageStatus}
                            sendResponse={sendResponse}
                            closeMessage={closeMessage}
                        />
                    ))}
                    {(visibleMessages !== undefined && answerRequired && visibleMessages[0].Content?.ExpectedResponse === CpdlcMessageExpectedResponseType.Roger && (
                        <RogerButtons
                            message={visibleMessages[0]}
                            selectedResponse={response}
                            setMessageStatus={setMessageStatus}
                            sendResponse={sendResponse}
                            closeMessage={closeMessage}
                        />
                    ))}
                    {(visibleMessages !== undefined && !answerRequired && visibleMessages[0].Direction === AtsuMessageDirection.Downlink && (
                        <OutputButtons
                            message={visibleMessages[0]}
                            sendMessage={sendMessage}
                            deleteMessage={deleteMessage}
                            closeMessage={closeMessage}
                        />
                    ))}
                    {(visibleMessages !== undefined && !answerRequired && visibleMessages[0].Direction === AtsuMessageDirection.Uplink && (
                        <CloseButtons
                            message={visibleMessages[0]}
                            closeMessage={closeMessage}
                        />
                    ))}
                    {(visibleMessages === undefined) && <RecallButtons recallMessage={recallMessage} />}
                    <AtsuStatusMessage visibleMessage={visibleMessageStatus} systemMessage={systemStatusMessage} />
                    <DcduLines />
                    {
                        (messages.size > 1
                        && (
                            <>
                                <g>
                                    <text className="status-atsu" fill="white" x="35%" y="2480">MSG</text>
                                    <text className="status-atsu" fill="white" x="35%" y="2720">
                                        {messageIndex + 1}
                                        {' '}
                                        /
                                        {' '}
                                        {messages.size}
                                    </text>
                                </g>
                            </>
                        ))
                    }
                </svg>
            </>
        );
    }
};

render(<DCDU />);
