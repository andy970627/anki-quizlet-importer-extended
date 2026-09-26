using UnityEngine;
using UnityEngine.AI;

/// <summary>
/// 掛在怪物 GameObject 上（需要 NavMeshAgent，場景要先 Bake NavMesh：
/// Window → AI → Navigation → Bake）。
/// 在偵測範圍外於巡邏點之間走動，玩家進入範圍後開始追逐；
/// 追上玩家時通知 HorrorGameManager 觸發 Game Over。
/// </summary>
[RequireComponent(typeof(NavMeshAgent))]
public class EnemyChaser : MonoBehaviour
{
    [SerializeField] private Transform player;
    [SerializeField] private Transform[] patrolPoints;
    [SerializeField] private float detectionRange = 8f;
    [SerializeField] private float catchDistance = 1.2f;

    private NavMeshAgent agent;
    private int patrolIndex;

    private void Awake()
    {
        agent = GetComponent<NavMeshAgent>();
    }

    private void Update()
    {
        if (player == null)
        {
            return;
        }

        float distanceToPlayer = Vector3.Distance(transform.position, player.position);

        if (distanceToPlayer <= catchDistance)
        {
            HorrorGameManager.Instance?.TriggerGameOver();
            return;
        }

        if (distanceToPlayer <= detectionRange)
        {
            agent.SetDestination(player.position);
        }
        else
        {
            Patrol();
        }
    }

    private void Patrol()
    {
        if (patrolPoints.Length == 0)
        {
            return;
        }

        if (!agent.pathPending && agent.remainingDistance <= agent.stoppingDistance)
        {
            patrolIndex = (patrolIndex + 1) % patrolPoints.Length;
            agent.SetDestination(patrolPoints[patrolIndex].position);
        }
    }
}
