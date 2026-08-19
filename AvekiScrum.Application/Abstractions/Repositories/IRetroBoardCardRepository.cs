using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Application.Abstractions.Repositories
{
    public interface IRetroBoardCardRepository
    {
        Task<RetroBoardCard> AddAsync(RetroBoardCard card, CancellationToken ct = default);
        Task<RetroActionItem> AddActionItemAsync(RetroActionItem item, CancellationToken ct = default);
        Task<RetroCheckInEntry> AddCheckInEntryAsync(RetroCheckInEntry entry, CancellationToken ct = default);
        Task<RetroHighlight> AddOrUpdateHighlightAsync(RetroHighlight highlight, CancellationToken ct = default);
        Task<RetroMeetingNote> AddMeetingNoteAsync(RetroMeetingNote note, CancellationToken ct = default);
        Task ClearBoardAsync(string boardKey, CancellationToken ct = default);
        Task DeleteAtAsync(string boardKey, string columnKey, int index, CancellationToken ct = default);
        Task DeleteMeetingNoteAsync(string boardKey, int id, CancellationToken ct = default);
        Task EnsureActionItemsForBoardAsync(string boardKey, CancellationToken ct = default);
        Task<IReadOnlyList<RetroActionItem>> GetActionItemsByBoardAsync(string boardKey, CancellationToken ct = default);
        Task<IReadOnlyList<RetroCheckInEntry>> GetCheckInsByBoardAsync(string boardKey, CancellationToken ct = default);
        Task<IReadOnlyList<RetroHighlight>> GetHighlightsByBoardAsync(string boardKey, CancellationToken ct = default);
        Task<IReadOnlyList<RetroMeetingNote>> GetMeetingNotesByBoardAsync(string boardKey, CancellationToken ct = default);
        Task<IReadOnlyList<RetroActionItem>> GetOpenActionItemsAsync(string teamId, string excludeBoardKey, CancellationToken ct = default);
        Task<IReadOnlyList<string>> GetRecentCheckInQuestionsAsync(string teamId, string excludeBoardKey, int take, CancellationToken ct = default);
        Task<IReadOnlyList<RetroBoardCard>> GetByBoardAsync(string boardKey, CancellationToken ct = default);
        Task<RetroMeetingProtocol?> GetPreviousProtocolAsync(string teamId, DateTime beforeDate, int maxAgeDays, string excludeBoardKey, CancellationToken ct = default);
        Task ResetMeetingAsync(string boardKey, CancellationToken ct = default);
        Task<RetroMeetingProtocol> SaveProtocolAsync(RetroMeetingProtocol protocol, CancellationToken ct = default);
        Task SetActionCompletedAsync(int id, bool isCompleted, CancellationToken ct = default);
        Task<RetroCheckInEntry> UpsertCheckInAsync(RetroCheckInEntry entry, CancellationToken ct = default);
    }
}
